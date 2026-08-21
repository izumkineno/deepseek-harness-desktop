//! 独立市场 sidecar 宿主（Scheme C）
//!
//! 后端 0 改：通过 Node sidecar `packages/desktop-market-host/host.mjs`
//! 复用 `packages/dsh-market/lib/routes.js` 的 `mountMarketRoutes`，
//! 宿主从 `dsh(cordis)` 换为 `desktop(Node http on 3082)`，
//! 与 `dsh web(3080/3081)` 进程完全独立——dsh 崩溃/未启动时市场仍可用。

#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Manager};

use crate::config;

/// 市场 sidecar 默认端口（与 dsh 的 3080/3081 隔离）
pub const MARKET_PORT: u16 = 3082;

/// sidecar 进程句柄（仅桌面持有的实例）
static MARKET_PID: AtomicU32 = AtomicU32::new(0);
static MARKET_STARTING: AtomicBool = AtomicBool::new(false);
static MARKET_CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn market_host_path(app_handle: &AppHandle) -> Option<PathBuf> {
    let candidates = [
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packages/desktop-market-host/host.mjs"),
        app_handle
            .path()
            .resource_dir()
            .ok()
            .map(|d| d.join("desktop-market-host/host.mjs"))
            .unwrap_or_default(),
        std::env::current_dir()
            .unwrap_or_default()
            .join("packages/desktop-market-host/host.mjs"),
    ];
    for p in candidates {
        if p.exists() {
            return Some(p);
        }
    }
    let fallback = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packages/desktop-market-host/host.mjs");
    if fallback.exists() {
        return Some(fallback);
    }
    None
}

fn dsh_market_lib_exists(app_handle: &AppHandle) -> bool {
    let candidates = [
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../packages/dsh-market/lib/routes.js"),
        app_handle
            .path()
            .resource_dir()
            .ok()
            .map(|d| d.join("dsh-market/lib/routes.js"))
            .unwrap_or_default(),
    ];
    candidates.iter().any(|p| p.exists())
}

pub fn get_market_port() -> u16 {
    MARKET_PORT
}

pub fn is_market_alive() -> bool {
    MARKET_PID.load(Ordering::SeqCst) != 0
}

/// 启动市场 sidecar（幂等：已在运行则直接返回）
pub async fn start(app_handle: AppHandle) -> Result<u16, String> {
    if MARKET_PID.load(Ordering::SeqCst) != 0 {
        log::info!("[market-host] already running on {}", MARKET_PORT);
        return Ok(MARKET_PORT);
    }
    if MARKET_STARTING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        for _ in 0..20 {
            tokio::time::sleep(Duration::from_millis(200)).await;
            if MARKET_PID.load(Ordering::SeqCst) != 0 {
                return Ok(MARKET_PORT);
            }
        }
        return Err("MARKET_START_CONFLICT: another market start in progress".to_string());
    }
    struct Guard;
    impl Drop for Guard {
        fn drop(&mut self) {
            MARKET_STARTING.store(false, Ordering::SeqCst);
        }
    }
    let _guard = Guard;

    let host_path = market_host_path(&app_handle)
        .ok_or_else(|| "MARKET_HOST_NOT_FOUND: packages/desktop-market-host/host.mjs not found".to_string())?;

    if !dsh_market_lib_exists(&app_handle) {
        log::warn!(
            "[market-host] dsh-market lib missing at {}, host={}",
            "packages/dsh-market/lib/routes.js",
            host_path.display()
        );
    }

    let node_bin = config::get_node_binary_path(&app_handle);
    if !node_bin.exists() {
        return Err(format!(
            "NODE_NOT_FOUND: node binary missing at {}",
            node_bin.display()
        ));
    }

    let mut envs: HashMap<String, String> = HashMap::new();
    envs.insert("MARKET_PORT".to_string(), MARKET_PORT.to_string());
    envs.insert("DSH_PROFILE".to_string(), "web".to_string());
    if let Ok(v) = std::env::var("DSH_HOME") {
        envs.insert("DSH_HOME".to_string(), v);
    }

    log::info!(
        "[market-host] spawning {} {} (profile=web port={})",
        node_bin.display(),
        host_path.display(),
        MARKET_PORT
    );

    let mut cmd = Command::new(&node_bin);
    cmd.arg(&host_path)
        .envs(&envs)
        .current_dir(host_path.parent().unwrap_or(&PathBuf::from(".")))
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd.spawn().map_err(|e| format!("MARKET_SPAWN_FAILED: {e}"))?;
    let pid = child.id();
    MARKET_PID.store(pid, Ordering::SeqCst);
    log::info!("[market-host] spawned pid={} port={}", pid, MARKET_PORT);

    if let Some(stdout) = child.stdout.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                log::info!("[market-host:stdout] {}", line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        std::thread::spawn(move || {
            use std::io::{BufRead, BufReader};
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                log::warn!("[market-host:stderr] {}", line);
            }
        });
    }

    *MARKET_CHILD.lock().unwrap() = Some(child);

    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(200)).await;
        if is_market_health_ok().await {
            log::info!("[market-host] ready on {}", MARKET_PORT);
            return Ok(MARKET_PORT);
        }
        if let Some(child) = MARKET_CHILD.lock().unwrap().as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    MARKET_PID.store(0, Ordering::SeqCst);
                    return Err(format!("MARKET_EXITED_EARLY: {status}"));
                }
                Ok(None) => {}
                Err(e) => log::warn!("[market-host] try_wait failed: {e}"),
            }
        }
    }

    log::warn!("[market-host] health check timeout, but pid held");
    Ok(MARKET_PORT)
}

async fn is_market_health_ok() -> bool {
    let url = format!("http://127.0.0.1:{}/__market_health", MARKET_PORT);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(800))
        .build();
    let Ok(client) = client else { return false };
    let Ok(resp) = client.get(&url).send().await else {
        return false;
    };
    resp.status().is_success()
}

/// 停止市场 sidecar（仅结束桌面持有的实例）
pub async fn stop() -> Result<(), String> {
    let pid = MARKET_PID.swap(0, Ordering::SeqCst);
    if pid == 0 {
        return Ok(());
    }
    log::info!("[market-host] stopping pid={}", pid);
    let mut guard = MARKET_CHILD.lock().unwrap();
    if let Some(mut child) = guard.take() {
        let _ = child.kill();
        let _ = child.wait();
    } else {
        #[cfg(windows)]
        {
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(0x08000000)
                .output();
        }
        #[cfg(not(windows))]
        {
            let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
        }
    }
    log::info!("[market-host] stopped");
    Ok(())
}

/// 应用退出时同步回收
pub fn stop_on_exit() {
    let pid = MARKET_PID.swap(0, Ordering::SeqCst);
    if pid == 0 {
        return;
    }
    if let Some(mut child) = MARKET_CHILD.lock().unwrap().take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn market_port_is_isolated_from_dsh() {
        assert_ne!(MARKET_PORT, 3080);
        assert_ne!(MARKET_PORT, 3081);
        assert_eq!(MARKET_PORT, 3082);
    }
}
