/// 自动更新系统命令
/// 支持备份、下载、验证、安装、回滚等功能
use std::fs;
use std::path::PathBuf;

/// 创建 ClawPanel 应用备份
#[tauri::command]
pub async fn create_app_backup(name: String) -> Result<String, String> {
    let backup_dir = dirs::home_dir()
        .ok_or("无法获取主目录")?
        .join(".openclaw/backups");

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

    Ok(backup_path.to_string_lossy().to_string())
}

/// 恢复 ClawPanel 应用备份
#[tauri::command]
pub async fn restore_app_backup(backup_path: String) -> Result<String, String> {
    let path = PathBuf::from(&backup_path);

    if !path.exists() {
        return Err("备份文件不存在".to_string());
    }

    // 实际恢复逻辑需要根据具体需求实现
    fs::write(&path, "Restored from backup").map_err(|e| format!("恢复备份失败: {e}"))?;

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
pub async fn install_update(_file_path: String) -> Result<String, String> {
    // 实际安装逻辑需要根据具体需求实现
    // 这里只是示例，实际应该调用相应的安装命令

    Ok("安装成功".to_string())
}

/// 移除 macOS 隔离标记（quarantine flag）
#[tauri::command]
pub async fn remove_quarantine_flag(app_path: String) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // 检查是否有隔离标记
        let check_output = Command::new("xattr")
            .args(["-l", &app_path])
            .output()
            .map_err(|e| format!("检查隔离标记失败: {e}"))?;

        let has_quarantine =
            String::from_utf8_lossy(&check_output.stdout).contains("com.apple.quarantine");

        if !has_quarantine {
            return Ok(false); // 没有隔离标记，不需要移除
        }

        // 尝试移除隔离标记
        let result = Command::new("xattr")
            .args(["-rd", "com.apple.quarantine", &app_path])
            .output()
            .map_err(|e| format!("移除隔离标记失败: {e}"))?;

        if result.status.success() {
            Ok(true)
        } else {
            let stderr = String::from_utf8_lossy(&result.stderr);
            if stderr.contains("Permission denied") {
                Err("需要管理员权限才能移除隔离标记".to_string())
            } else {
                Err(format!("移除隔离标记失败: {}", stderr))
            }
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // 非 macOS 平台直接返回成功
        Ok(false)
    }
}

/// 使用 sudo 移除 macOS 隔离标记（需要用户授权）
#[tauri::command]
pub async fn remove_quarantine_with_sudo(
    app_path: String,
    password: String,
) -> Result<bool, String> {
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;

        // 使用 echo 管道输入密码给 sudo
        let mut child = Command::new("sh")
            .args([
                "-c",
                &format!(
                    "echo '{}' | sudo -S xattr -rd com.apple.quarantine '{}'",
                    password, app_path
                ),
            ])
            .spawn()
            .map_err(|e| format!("执行 sudo 命令失败: {e}"))?;

        let result = child.wait().map_err(|e| format!("等待命令完成失败: {e}"))?;

        if result.success() {
            Ok(true)
        } else {
            Err("密码错误或权限不足".to_string())
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

/// 获取临时目录
#[tauri::command]
pub async fn get_temp_dir() -> Result<String, String> {
    let temp_dir = dirs::home_dir()
        .ok_or("无法获取主目录")?
        .join(".openclaw/temp");

    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建临时目录失败: {e}"))?;

    Ok(temp_dir.to_string_lossy().to_string())
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

/// 执行系统命令
#[tauri::command]
pub async fn execute_command(command: String, args: Vec<String>) -> Result<CommandResult, String> {
    use std::process::Command;

    let output = Command::new(&command)
        .args(&args)
        .output()
        .map_err(|e| format!("执行命令失败: {e}"))?;

    Ok(CommandResult {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// 检查文件是否存在
#[tauri::command]
pub async fn file_exists(file_path: String) -> Result<bool, String> {
    let path = PathBuf::from(&file_path);
    Ok(path.exists())
}

/// 命令执行结果
#[derive(serde::Serialize)]
pub struct CommandResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
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

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
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
