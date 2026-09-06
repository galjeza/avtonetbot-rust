use std::fs;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

/// User configuration, persisted as JSON in the app config directory.
///
/// `password` is stored in cleartext. Everything that touches it lives in this
/// module, so moving it to the OS credential store later is a local change.
#[derive(Debug, Default, Clone, Serialize, Deserialize)]
pub struct Config {
    #[serde(default)]
    pub email: String,
    #[serde(default)]
    pub password: String,
}

fn config_path(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join("config.json"))
        .map_err(|e| format!("Ni mogoče določiti mape z nastavitvami: {e}"))
}

/// Reads the stored configuration. A missing file is not an error — it just
/// means nothing has been configured yet.
pub fn load(app: &AppHandle) -> Result<Config, String> {
    let path = config_path(app)?;
    match fs::read_to_string(&path) {
        Ok(contents) => serde_json::from_str(&contents)
            .map_err(|e| format!("Nastavitve so poškodovane: {e}")),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        Err(e) => Err(format!("Nastavitev ni mogoče prebrati: {e}")),
    }
}

pub fn save(app: &AppHandle, config: &Config) -> Result<(), String> {
    let path = config_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Mape z nastavitvami ni mogoče ustvariti: {e}"))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Nastavitev ni mogoče zapisati: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Nastavitev ni mogoče shraniti: {e}"))
}
