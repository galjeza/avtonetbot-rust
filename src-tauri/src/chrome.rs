//! Drives the user's Chrome over the DevTools protocol.
//!
//! Chrome 136+ refuses `--remote-debugging-port` when the default user data
//! directory is in use, so we cannot attach to the browser the user runs day
//! to day. Instead we seed a copy of their profile once and drive that. The
//! avto.net login cookie is persistent (a week), so the copy carries the
//! session and the user does not have to sign in again.

use std::fs;
use std::path::{Path, PathBuf};

use chromiumoxide::browser::{Browser, BrowserConfig};
use futures::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Manager};

const WELCOME_URL: &str = "https://www.avto.net/_2016mojavtonet/welcome.asp";

/// Caches and lock files: skipped when seeding, so the copy stays small and
/// Chrome does not think another instance owns the profile.
const SKIP: &[&str] = &[
    "Cache",
    "Code Cache",
    "GPUCache",
    "GrShaderCache",
    "ShaderCache",
    "Service Worker",
    "Crashpad",
    "component_crx_cache",
    "extensions_crx_cache",
];

#[derive(Debug, Serialize)]
pub struct SessionCheck {
    pub logged_in: bool,
    /// Where we ended up after asking for the account page.
    pub final_url: String,
    /// True when this run seeded the profile from the user's Chrome.
    pub profile_seeded: bool,
}

/// The profile Chrome uses when launched normally.
fn user_profile_dir() -> Option<PathBuf> {
    let home = dirs_home()?;
    let candidates: Vec<PathBuf> = if cfg!(target_os = "windows") {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from)?;
        vec![local.join("Google/Chrome/User Data")]
    } else if cfg!(target_os = "macos") {
        vec![home.join("Library/Application Support/Google/Chrome")]
    } else {
        vec![
            home.join(".config/google-chrome"),
            home.join(".config/chromium"),
        ]
    };
    candidates.into_iter().find(|p| p.is_dir())
}

fn dirs_home() -> Option<PathBuf> {
    std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
}

/// Our own copy, inside the app data directory.
fn bot_profile_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("chrome-profile"))
        .map_err(|e| format!("Ni mogoče določiti mape s podatki: {e}"))
}

fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    fs::create_dir_all(to)?;
    for entry in fs::read_dir(from)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();

        // Singleton* are locks pointing at the running instance; copying them
        // makes Chrome hand off to that instance instead of starting.
        if name_str.starts_with("Singleton") || SKIP.contains(&name_str.as_ref()) {
            continue;
        }

        let src = entry.path();
        let dst = to.join(&name);
        match entry.file_type() {
            Ok(t) if t.is_dir() => copy_tree(&src, &dst)?,
            Ok(t) if t.is_file() => {
                // A profile in use can hold files we cannot read; skip them
                // rather than abort the whole copy.
                let _ = fs::copy(&src, &dst);
            }
            _ => {}
        }
    }
    Ok(())
}

/// Seeds our profile from the user's on first run. Returns whether it copied.
fn ensure_profile(app: &AppHandle) -> Result<(PathBuf, bool), String> {
    let dst = bot_profile_dir(app)?;
    if dst.exists() {
        return Ok((dst, false));
    }
    let src = user_profile_dir()
        .ok_or("Chromovega profila ni bilo mogoče najti. Ali je Chrome nameščen?")?;
    copy_tree(&src, &dst).map_err(|e| format!("Profila ni bilo mogoče kopirati: {e}"))?;
    Ok((dst, true))
}

/// Launches Chrome on our profile and reports whether the avto.net session is
/// still valid, by asking for the account page and seeing where we land.
pub async fn check_session(app: AppHandle) -> Result<SessionCheck, String> {
    let (profile, profile_seeded) = ensure_profile(&app)?;

    let config = BrowserConfig::builder()
        .user_data_dir(&profile)
        .with_head()
        .build()?;

    let (mut browser, mut handler) = Browser::launch(config)
        .await
        .map_err(|e| format!("Chroma ni bilo mogoče zagnati: {e}"))?;

    let drive = tokio::spawn(async move { while handler.next().await.is_some() {} });

    let result = async {
        let page = browser
            .new_page(WELCOME_URL)
            .await
            .map_err(|e| format!("Strani ni bilo mogoče odpreti: {e}"))?;
        page.wait_for_navigation()
            .await
            .map_err(|e| format!("Nalaganje strani ni uspelo: {e}"))?;
        let final_url = page.url().await.map_err(|e| e.to_string())?.unwrap_or_default();
        Ok::<_, String>(SessionCheck {
            logged_in: final_url.starts_with(WELCOME_URL),
            final_url,
            profile_seeded,
        })
    }
    .await;

    let _ = browser.close().await;
    let _ = browser.wait().await;
    drive.abort();

    result
}
