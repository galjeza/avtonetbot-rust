mod config;

use config::Config;

const USER_ENDPOINT: &str = "https://avtonet-server.onrender.com/user";

#[tauri::command]
fn get_config(app: tauri::AppHandle) -> Result<Config, String> {
    config::load(&app)
}

#[tauri::command]
fn save_config(app: tauri::AppHandle, config: Config) -> Result<(), String> {
    config::save(&app, &config)
}

/// Looks the user up on the licence server and returns the record verbatim.
///
/// The server answers 200 with a `null` body for an address it does not know,
/// so a null result means "no such user", not a failure. The payload is passed
/// through untyped because the frontend only reads `subscriptionPaidTo` and
/// `brokerId`, and typing it here would drop any field the server adds later.
#[tauri::command]
async fn fetch_user_meta(email: String) -> Result<serde_json::Value, String> {
    let response = reqwest::Client::new()
        .get(USER_ENDPOINT)
        .query(&[("email", email.as_str())])
        .send()
        .await
        .map_err(|e| format!("Strežnik ni dosegljiv: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!("Strežnik je vrnil napako {status}."));
    }

    response
        .json()
        .await
        .map_err(|e| format!("Odgovora strežnika ni mogoče prebrati: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            fetch_user_meta
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
