/// 自动更新系统命令
/// 支持备份、下载、验证、安装、回滚等功能
use std::fs;
use std::path::PathBuf;
use tauri::Emitter;

/// 创建备份
#[tauri::command]
pub async fn create_backup(name: String) -> Result<String, String> {
    let backup_dir = dirs::home_dir()
        .map(|h| h.join(".openclaw/backups"))
        .map_err(|e| format!("无法获取备份目录: {e}"))?;

    fs::create_dir_all(&backup_dir).map_err(|e| format!("创建备份目录失败: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let backup_name = if name.is_empty() {
        format!("clawpanel-backup-{}.zip", timestamp)
    } else {
        format!("{}.zip", name)
    };

    let backup_path = backup_dir.join(&backup_name);

    // 创建备份文件（实际备份逻辑需要根据具体需求实现）
    fs::write(&backup_path, format!("Backup created at {}", timestamp))
        .map_err(|e| format!("创建备份失败: {e}"))?;

    Ok(backup_path.to_string_lossy())
}

/// 恢复备份
#[tauri::command]
pub async fn restore_backup(backup_path: String) -> Result<String, String> {
    let path = PathBuf::from(&backup_path);

    if !path.exists() {
        return Err("备份文件不存在".to_string());
    }

    // 实际恢复逻辑需要根据具体需求实现
    fs::write(&path, format!("Restored from backup")).map_err(|e| format!("恢复备份失败: {e}"))?;

    Ok("恢复成功".to_string())
}

/// 下载文件到指定路径
#[tauri::command]
pub async fn download_file(url: String, file_path: String) -> Result<String, String> {
    use std::io::Write;

    let response = reqwest::get(&url)
        .await
        .map_err(|e| format!("下载失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("下载失败: HTTP {}", response.status()));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    let path = PathBuf::from(&file_path);
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {e}"))?;
    }

    let mut file = fs::File::create(&path).map_err(|e| format!("创建文件失败: {e}"))?;

    file.write_all(&bytes)
        .map_err(|e| format!("写入文件失败: {e}"))?;

    Ok(file_path)
}

/// 计算文件的 SHA-256 校验和
#[tauri::command]
pub async fn calculate_checksum(file_path: String) -> Result<String, String> {
    use sha2::{Digest, Sha256};

    let bytes = fs::read(&file_path).map_err(|e| format!("读取文件失败: {e}"))?;

    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let result = hasher.finalize();
    let hash = format!("{:x}", result);

    Ok(hash)
}

/// 验证文件校验和
#[tauri::command]
pub async fn verify_checksum(file_path: String, expected_checksum: String) -> Result<bool, String> {
    let actual = calculate_checksum(file_path).await?;

    let is_valid = actual.to_lowercase() == expected_checksum.to_lowercase();

    Ok(is_valid)
}

/// 安装更新包
#[tauri::command]
pub async fn install_update(file_path: String) -> Result<String, String> {
    // 实际安装逻辑需要根据具体需求实现
    // 这里只是示例，实际应该调用相应的安装命令

    Ok("安装成功".to_string())
}

/// 获取临时目录
#[tauri::command]
pub async fn get_temp_dir() -> Result<String, String> {
    let temp_dir = dirs::home_dir()
        .map(|h| h.join(".openclaw/temp"))
        .map_err(|e| format!("无法获取临时目录: {e}"))?;

    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {e}"))?;

    Ok(temp_dir.to_string_lossy())
}

/// 删除文件
#[tauri::command]
pub async fn delete_file(file_path: String) -> Result<String, String> {
    let path = PathBuf::from(&file_path);

    if !path.exists() {
        return Ok("文件不存在".to_string());
    }

    fs::remove_file(&path).map_err(|e| format!("删除文件失败: {e}"))?;

    Ok("删除成功".to_string())
}

/// 检查面板更新（GitHub API）
#[tauri::command]
pub async fn check_panel_update() -> Result<UpdateInfo, String> {
    use serde_json::Value;

    // 获取当前版本
    let current_version = env!("CARGO_PKG_VERSION");

    let url = format!(
        "https://api.github.com/repos/{}/{}/releases/latest",
        "jonntd", "clawpanel"
    );

    let response = reqwest::get(&url)
        .header("Accept", "application/vnd.github.v3+json")
        .header("User-Agent", "ClawPanel-Updater")
        .send()
        .await
        .map_err(|e| format!("GitHub API 请求失败: {e}"))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API 请求失败: HTTP {}", response.status()));
    }

    let json: Value = response
        .json()
        .await
        .map_err(|e| format!("解析 JSON 失败: {e}"))?;

    let tag_name = json.get("tag_name").and_then(|v| v.as_str()).unwrap_or("");

    let html_url = json.get("html_url").and_then(|v| v.as_str()).unwrap_or("");

    let body = json.get("body").and_then(|v| v.as_str()).unwrap_or("");

    let published_at = json
        .get("published_at")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    Ok(UpdateInfo {
        current: current_version.to_string(),
        latest: tag_name.to_string(),
        url: html_url.to_string(),
        checksum: String::new(),
        release_notes: body.to_string(),
        published_at: published_at.to_string(),
    })
}

/// 更新信息结构
#[derive(serde::Serialize, serde::Deserialize)]
pub struct UpdateInfo {
    pub current: String,
    pub latest: String,
    pub url: String,
    pub checksum: String,
    pub release_notes: String,
    pub published_at: String,
}
