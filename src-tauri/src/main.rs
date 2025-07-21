#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod scanner;

use scanner::{scan_directory, cancel_scan, FileNode};
use std::path::Path;

#[tauri::command]
async fn scan_path(path: String, app_handle: tauri::AppHandle) -> Result<FileNode, String> {
    let path = Path::new(&path);
    scan_directory(path, &app_handle)
}

#[tauri::command]
fn get_home_directory() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "Failed to get home directory".to_string())
}

#[tauri::command]
fn show_in_finder(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        
        Command::new("open")
            .arg("-R")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
        
        Ok(())
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err("Show in Finder is only available on macOS".to_string())
    }
}

#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        
        // Use osascript to move file to trash
        let script = format!(
            r#"tell application "Finder" to delete POSIX file "{}" "#,
            path
        );
        
        let output = Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| format!("Failed to execute AppleScript: {}", e))?;
        
        if !output.status.success() {
            let error = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to move to trash: {}", error));
        }
        
        Ok(())
    }
    
    #[cfg(not(target_os = "macos"))]
    {
        Err("Move to Trash is only available on macOS".to_string())
    }
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            scan_path,
            get_home_directory,
            cancel_scan,
            show_in_finder,
            move_to_trash
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}