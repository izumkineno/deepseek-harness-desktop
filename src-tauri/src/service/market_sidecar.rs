//! market sidecar — Node 驱动的 dsh-market 后端进程管家
//! Rust 仅负责：拉起/回收 Node 进程 + 端口探活，不执行业务逻辑
//! 业务 100% 在 packages/market-compat/wrapper.mjs → packages/dsh-market/src/*

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use tauri::AppHandle;

const SIDECAR_PORT: u16 = 3099;
static STARTED: AtomicBool = AtomicBool::new(false);
static PROFILE_DIR: OnceLock<PathBuf> = OnceLock::new();

fn profile_dir(app: &AppHandle) -> PathBuf {
    if let Some(p) = PROFILE_DIR.get() {
        return p.clone();
    }
    let p = crate::config::get_dsh_data_path(app).join("profiles").join("web");
    let _ = PROFILE_DIR.set(p.clone());
    p
}

fn wrapper_path() -> Option<PathBuf> {
    // 开发时：packages/market-compat/wrapper.mjs
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../packages/market-compat/wrapper.mjs");
    if dev.exists() {
        return Some(dev);
    }
    // 打包后：resources/market-compat/wrapper.mjs
    let res = PathBuf::from("resources/market-compat/wrapper.mjs");
    if res.exists() {
        return Some(res);
    }
    None
}

fn node_bin(app: &AppHandle) -> Option<PathBuf> {
    // 复用与 harness 一致的 Node 解析：本地兼容版 > 捆绑运行时
    let p = crate::config::get_node_binary_path(app);
    if p.exists() {
        return Some(p);
    }
    // 兜底：显式探测 PATH 上的 node（GUI 进程 PATH 可能与终端不同）
    if let Some(local) = crate::config::get_local_node_path() {
        if local.exists() {
            return Some(local);
        }
    }
    // 最后尝试直接让 OS 解析（依赖 PATH）
    // 此时返回 None 让上层打 warn，而不是返回 "node" 导致 CreateProcessW 找不到文件
    None
}

/// 启动 sidecar（幂等）
pub fn ensure_started(app: AppHandle) {
    if STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let app2 = app.clone();
    tauri::async_runtime::spawn(async move {
        // 等 harness 启动后再拉 sidecar，避免端口与 Node 下载竞争
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        let Some(wrapper) = wrapper_path() else {
            log::warn!("[market-sidecar] wrapper.mjs not found, skip");
            return;
        };
        let Some(node) = node_bin(&app2) else {
            log::warn!("[market-sidecar] node not found, skip");
            return;
        };
        let dir = profile_dir(&app2);
        let port = SIDECAR_PORT.to_string();
        let dir_str = dir.to_string_lossy().to_string();
        let wrapper_str = wrapper.to_string_lossy().to_string();
        let node_str = node.to_string_lossy().to_string();
        // 将 dsh 二进制路径显式传给 wrapper，避免 wrapper 内再猜 PATH
        let dsh_bin = crate::config::get_dsh_binary_path(&app2);
        let dsh_bin_str = dsh_bin.to_string_lossy().to_string();
        let has_dsh = dsh_bin.exists();
        log::info!("[market-sidecar] spawn node {node_str} {wrapper_str} --port {port} --profile-dir {dir_str} --dsh-bin {dsh_bin_str} exists={has_dsh}");

        #[cfg(windows)]
        {
            use std::collections::HashMap;
            use std::ffi::OsString;
            use std::io::{BufRead, BufReader};
            let mut envs = HashMap::new();
            for (k, v) in std::env::vars() {
                envs.insert(k, v);
            }
            let mut args: Vec<OsString> = vec![
                OsString::from("--experimental-strip-types"),
                OsString::from(wrapper_str.clone()),
                OsString::from("--port"),
                OsString::from(port.clone()),
                OsString::from("--profile-dir"),
                OsString::from(dir_str.clone()),
            ];
            if has_dsh {
                args.push(OsString::from("--dsh-bin"));
                args.push(OsString::from(dsh_bin_str.clone()));
            }
            let prog = PathBuf::from(node_str.clone());
            match crate::service::workflow::win_spawn::spawn_with_hidden_console_tracked(
                &prog, &args, None, &envs,
            ) {
                Ok((out, err, _handle)) => {
                    log::info!("[market-sidecar] started pid handle={_handle:?}");
                    // 转发 wrapper 的 stdout/stderr 到 Rust 日志，便于诊断
                    std::thread::spawn(move || {
                        let reader = BufReader::new(out);
                        for line in reader.lines().map_while(Result::ok) {
                            log::info!("[market-sidecar:out] {line}");
                        }
                    });
                    std::thread::spawn(move || {
                        let reader = BufReader::new(err);
                        for line in reader.lines().map_while(Result::ok) {
                            log::warn!("[market-sidecar:err] {line}");
                        }
                    });
                    // 延迟探活，2s 后尝试 TCP 连接 3099
                    let port_clone = port.clone();
                    tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
                        let addr = format!("127.0.0.1:{port_clone}");
                        match tokio::net::TcpStream::connect(&addr).await {
                            Ok(_) => log::info!("[market-sidecar] health {addr} -> tcp ok"),
                            Err(e) => log::warn!("[market-sidecar] health {addr} tcp failed: {e}"),
                        }
                    });
                }
                Err(e) => log::warn!("[market-sidecar] spawn failed: {e}"),
            }
        }
        #[cfg(not(windows))]
        {
            use std::process::Command;
            let mut cmd = Command::new(node_str.clone());
            cmd.arg("--experimental-strip-types")
                .arg(wrapper_str.clone())
                .arg("--port")
                .arg(port.clone())
                .arg("--profile-dir")
                .arg(dir_str.clone());
            if has_dsh {
                cmd.arg("--dsh-bin").arg(dsh_bin_str.clone());
            }
            match cmd.spawn() {
                Ok(mut child) => {
                    log::info!("[market-sidecar] started pid={:?}", child.id());
                    // 尝试捕获子进程输出（若有 pipe）
                    if let Some(stdout) = child.stdout.take() {
                        std::thread::spawn(move || {
                            use std::io::{BufRead, BufReader};
                            let reader = BufReader::new(stdout);
                            for line in reader.lines().map_while(Result::ok) {
                                log::info!("[market-sidecar:out] {line}");
                            }
                        });
                    }
                    if let Some(stderr) = child.stderr.take() {
                        std::thread::spawn(move || {
                            use std::io::{BufRead, BufReader};
                            let reader = BufReader::new(stderr);
                            for line in reader.lines().map_while(Result::ok) {
                                log::warn!("[market-sidecar:err] {line}");
                            }
                        });
                    }
                }
                Err(e) => log::warn!("[market-sidecar] spawn failed: {e}"),
            }
        }
    });
}
/// 停止时由 RunEvent::Exit 调用，系统回收子进程树（Windows taskkill 兜底）
pub fn stop() {
    // sidecar 与 harness 同属本进程子树，随主进程退出由 OS 回收
    // Windows 下 workflow::stop_on_exit 已做 taskkill /T
    STARTED.store(false, Ordering::SeqCst);
}
