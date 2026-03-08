/**
 * 自动更新系统
 * 支持 GitHub API 版本检查、安全下载、完整性验证、备份、静默安装、回滚
 */

import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

// GitHub API 配置
const GITHUB_API_BASE = 'https://api.github.com/repos'
const REPO_OWNER = 'jonntd'
const REPO_NAME = 'clawpanel'

// 更新状态枚举
const UpdateStatus = {
  IDLE: 'idle',
  CHECKING: 'checking',
  DOWNLOADING: 'downloading',
  VERIFYING: 'verifying',
  BACKING_UP: 'backing_up',
  INSTALLING: 'installing',
  VALIDATING: 'validating',
  SUCCESS: 'success',
  FAILED: 'failed',
  ROLLBACK: 'rollback'
}

// 更新状态管理
let updateState = {
  status: UpdateStatus.IDLE,
  progress: 0,
  currentVersion: null,
  latestVersion: null,
  downloadUrl: null,
  checksum: null,
  backupPath: null,
  error: null
}

// 版本比较工具函数
function compareVersions(v1, v2) {
  const parse = (v) => v.split('.').map(Number)
  const p1 = parse(v1)
  const p2 = parse(v2)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const n1 = p1[i] || 0
    const n2 = p2[i] || 0
    if (n1 > n2) return 1
    if (n1 < n2) return -1
  }
  return 0
}

// 格式化版本号
function formatVersion(version) {
  if (!version) return '未知'
  return version.startsWith('v') ? version : `v${version}`
}

// SHA-256 哈希计算
async function calculateChecksum(filePath) {
  try {
    const buffer = await api.readFile(filePath)
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    return hashHex
  } catch (e) {
    console.error('[Update] 计算校验和失败:', e)
    throw new Error('计算校验和失败')
  }
}

// 下载文件（带进度）
async function downloadFile(url, onProgress) {
  try {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`下载失败: HTTP ${response.status}`)
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength) : 0
    const reader = response.body.getReader()
    const chunks = []
    let received = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      chunks.push(value)
      received += value.length

      if (total > 0 && onProgress) {
        const progress = Math.min(Math.round((received / total) * 100), 100)
        onProgress(progress)
      }
    }

    return new Blob(chunks)
  } catch (e) {
    console.error('[Update] 下载文件失败:', e)
    throw e
  }
}

// 备份当前版本
async function backupCurrentVersion(version) {
  try {
    updateState.status = UpdateStatus.BACKING_UP
    updateState.progress = 0
    notifyUpdateState()

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const backupName = `clawpanel-backup-${version}-${timestamp}.zip`

    const backupPath = await api.createBackup(backupName)

    updateState.backupPath = backupPath
    updateState.progress = 100
    notifyUpdateState()

    console.log('[Update] 备份完成:', backupPath)
    return backupPath
  } catch (e) {
    console.error('[Update] 备份失败:', e)
    throw new Error(`备份失败: ${e.message}`)
  }
}

// 验证下载的文件
async function verifyDownloadedFile(filePath, expectedChecksum) {
  try {
    updateState.status = UpdateStatus.VERIFYING
    updateState.progress = 0
    notifyUpdateState()

    const actualChecksum = await calculateChecksum(filePath)
    const isValid = actualChecksum.toLowerCase() === expectedChecksum.toLowerCase()

    updateState.progress = 100
    notifyUpdateState()

    if (!isValid) {
      throw new Error('文件完整性验证失败：校验和不匹配')
    }

    console.log('[Update] 文件验证通过')
    return true
  } catch (e) {
    console.error('[Update] 验证失败:', e)
    throw e
  }
}

// 静默安装更新
async function installUpdate(filePath) {
  try {
    updateState.status = UpdateStatus.INSTALLING
    updateState.progress = 0
    notifyUpdateState()

    // 使用 Tauri API 执行安装
    await api.installUpdate(filePath)

    updateState.progress = 100
    notifyUpdateState()

    console.log('[Update] 安装完成')
    return true
  } catch (e) {
    console.error('[Update] 安装失败:', e)
    throw new Error(`安装失败: ${e.message}`)
  }
}

// macOS 专用：安装 DMG 更新并移除隔离标记
async function installMacOSUpdate(dmgPath, options = {}) {
  const { autoLaunch = true } = options

  try {
    updateState.status = UpdateStatus.INSTALLING
    updateState.progress = 0
    notifyUpdateState()

    console.log('[Update] 开始安装 macOS 更新:', dmgPath)

    // 1. 挂载 DMG
    updateState.progress = 10
    notifyUpdateState()

    const mountResult = await api.executeCommand('hdiutil', ['attach', dmgPath, '-nobrowse'])
    if (mountResult.code !== 0) {
      throw new Error('挂载 DMG 失败: ' + mountResult.stderr)
    }

    // 解析挂载点
    const mountPoint = mountResult.stdout.match(/\/Volumes\/[^\n]+/)?.[0]
    if (!mountPoint) {
      throw new Error('无法获取 DMG 挂载点')
    }

    console.log('[Update] DMG 挂载点:', mountPoint)
    updateState.progress = 30
    notifyUpdateState()

    // 2. 查找应用
    const appName = 'ClawPanel.app'
    const appPath = `${mountPoint}/${appName}`
    const installPath = `/Applications/${appName}`

    // 检查是否存在安装脚本
    const installerScript = `${mountPoint}/安装ClawPanel.command`
    const hasInstaller = await api.fileExists(installerScript)

    if (hasInstaller) {
      // 使用安装脚本
      console.log('[Update] 使用安装脚本')
      updateState.progress = 50
      notifyUpdateState()

      // 执行安装脚本（静默模式）
      const installResult = await api.executeCommand('bash', [installerScript, 'silent'])
      if (installResult.code !== 0) {
        throw new Error('安装脚本执行失败: ' + installResult.stderr)
      }
    } else {
      // 手动安装流程
      console.log('[Update] 使用手动安装流程')

      // 3. 关闭当前应用
      updateState.progress = 40
      notifyUpdateState()
      console.log('[Update] 准备关闭当前应用...')

      // 4. 备份当前版本
      updateState.progress = 50
      notifyUpdateState()
      const backupPath = `/Applications/${appName}.backup.${Date.now()}`
      await api.executeCommand('mv', [installPath, backupPath])

      // 5. 复制新版本
      updateState.progress = 70
      notifyUpdateState()
      const copyResult = await api.executeCommand('cp', ['-R', appPath, installPath])
      if (copyResult.code !== 0) {
        // 复制失败，回滚
        await api.executeCommand('mv', [backupPath, installPath])
        throw new Error('复制新版本失败')
      }

      // 6. 移除隔离标记
      updateState.progress = 85
      notifyUpdateState()
      console.log('[Update] 移除隔离标记...')

      const quarantineResult = await api.removeQuarantineFlag(installPath)
      if (!quarantineResult) {
        // 需要 sudo，尝试使用密码（如果提供了）
        if (options.sudoPassword) {
          await api.removeQuarantineWithSudo(installPath, options.sudoPassword)
        } else {
          console.warn('[Update] 需要管理员权限移除隔离标记')
          // 继续，让用户手动处理
        }
      }

      // 7. 删除备份
      updateState.progress = 95
      notifyUpdateState()
      await api.executeCommand('rm', ['-rf', backupPath])
    }

    // 8. 卸载 DMG
    await api.executeCommand('hdiutil', ['detach', mountPoint])

    // 9. 删除下载的 DMG
    await api.deleteFile(dmgPath)

    updateState.progress = 100
    notifyUpdateState()

    console.log('[Update] macOS 更新安装完成')

    // 10. 自动启动新版本
    if (autoLaunch) {
      console.log('[Update] 启动新版本...')
      await api.executeCommand('open', [installPath])
    }

    return true
  } catch (e) {
    console.error('[Update] macOS 安装失败:', e)
    throw new Error(`安装失败: ${e.message}`)
  }
}

// 回滚到备份版本
async function rollbackToBackup(backupPath) {
  try {
    updateState.status = UpdateStatus.ROLLBACK
    updateState.progress = 0
    notifyUpdateState()

    await api.restoreBackup(backupPath)

    updateState.progress = 100
    notifyUpdateState()

    console.log('[Update] 回滚完成')
    return true
  } catch (e) {
    console.error('[Update] 回滚失败:', e)
    throw new Error(`回滚失败: ${e.message}`)
  }
}

// 更新后验证
async function validateUpdate(expectedVersion) {
  try {
    updateState.status = UpdateStatus.VALIDATING
    updateState.progress = 0
    notifyUpdateState()

    // 获取当前版本
    const versionInfo = await api.getVersionInfo()
    const currentVersion = versionInfo.current || versionInfo.panel_version

    updateState.progress = 50

    // 验证版本是否正确
    const isCorrect = compareVersions(currentVersion, expectedVersion) === 0

    updateState.progress = 100
    notifyUpdateState()

    if (!isCorrect) {
      throw new Error(`版本验证失败: 期望 ${expectedVersion}, 实际 ${currentVersion}`)
    }

    console.log('[Update] 验证通过，版本:', currentVersion)
    return true
  } catch (e) {
    console.error('[Update] 验证失败:', e)
    throw e
  }
}

// 检查更新（GitHub API）
async function checkForUpdates() {
  try {
    updateState.status = UpdateStatus.CHECKING
    updateState.progress = 0
    updateState.error = null
    notifyUpdateState()

    // 获取当前版本
    const versionInfo = await api.getVersionInfo()
    const currentVersion = versionInfo.current || versionInfo.panel_version
    updateState.currentVersion = currentVersion

    updateState.progress = 30

    // 查询 GitHub Releases API
    const url = `${GITHUB_API_BASE}/${REPO_OWNER}/${REPO_NAME}/releases/latest`
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ClawPanel-Updater'
      }
    })

    if (!response.ok) {
      throw new Error(`GitHub API 请求失败: HTTP ${response.status}`)
    }

    const release = await response.json()

    updateState.progress = 60

    // 解析版本号
    const latestVersion = release.tag_name || release.name
    updateState.latestVersion = latestVersion
    updateState.downloadUrl = release.html_url

    // 查找校验和（如果发布包含）
    const asset = release.assets?.find(a => a.name.endsWith('.zip') || a.name.endsWith('.tar.gz'))
    updateState.checksum = asset?.browser_download_url || null

    updateState.progress = 100

    // 比较版本
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0

    updateState.status = UpdateStatus.IDLE
    notifyUpdateState()

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      downloadUrl: updateState.downloadUrl,
      checksum: updateState.checksum,
      releaseNotes: release.body || '',
      publishedAt: release.published_at
    }
  } catch (e) {
    console.error('[Update] 检查更新失败:', e)
    updateState.status = UpdateStatus.FAILED
    updateState.error = e.message
    notifyUpdateState()
    throw e
  }
}

// 执行完整更新流程
async function performUpdate(options = {}) {
  const {
    autoBackup = true,
    autoInstall = false,
    onProgress = null
  } = options

  try {
    // 1. 检查更新
    const updateInfo = await checkForUpdates()
    if (!updateInfo.hasUpdate) {
      toast('当前已是最新版本', 'success')
      return { success: true, message: '已是最新版本' }
    }

    console.log('[Update] 发现新版本:', updateInfo)

    // 2. 下载更新包
    updateState.status = UpdateStatus.DOWNLOADING
    updateState.progress = 0
    notifyUpdateState()

    const tempDir = await api.getTempDir()
    const fileName = `clawpanel-${updateInfo.latestVersion}.zip`
    const filePath = `${tempDir}/${fileName}`

    await downloadFile(updateInfo.downloadUrl, (progress) => {
      updateState.progress = Math.round(progress * 0.7)
      if (onProgress) onProgress(updateState.progress)
      notifyUpdateState()
    })

    console.log('[Update] 下载完成:', filePath)

    // 3. 验证文件完整性
    if (updateInfo.checksum) {
      await verifyDownloadedFile(filePath, updateInfo.checksum)
    }

    // 4. 备份当前版本
    if (autoBackup) {
      await backupCurrentVersion(updateState.currentVersion)
    }

    // 5. 安装更新
    if (autoInstall) {
      // 检测平台并使用对应的安装方式
      const platform = navigator.platform.toLowerCase()
      const isMac = platform.includes('mac')

      if (isMac && filePath.endsWith('.dmg')) {
        // macOS: 使用 DMG 安装流程
        await installMacOSUpdate(filePath, { autoLaunch: true, sudoPassword: options.sudoPassword })
      } else {
        // 其他平台: 使用通用安装流程
        await installUpdate(filePath)
      }
    } else {
      updateState.status = UpdateStatus.SUCCESS
      updateState.progress = 100
      notifyUpdateState()
      return {
        success: true,
        message: '下载完成，请手动安装',
        filePath,
        requiresManualInstall: true
      }
    }

    // 6. 验证更新
    await validateUpdate(updateInfo.latestVersion)

    updateState.status = UpdateStatus.SUCCESS
    updateState.progress = 100
    notifyUpdateState()

    // 清理临时文件
    try {
      await api.deleteFile(filePath)
    } catch (e) {
      console.warn('[Update] 清理临时文件失败:', e)
    }

    return {
      success: true,
      message: '更新成功',
      version: updateInfo.latestVersion
    }
  } catch (e) {
    console.error('[Update] 更新失败:', e)
    updateState.status = UpdateStatus.FAILED
    updateState.error = e.message
    updateState.progress = 0
    notifyUpdateState()

    // 尝试回滚
    if (updateState.backupPath) {
      try {
        await rollbackToBackup(updateState.backupPath)
        toast('已自动回滚到备份版本', 'warning')
      } catch (rollbackError) {
        console.error('[Update] 回滚也失败了:', rollbackError)
        toast(`更新失败且回滚失败: ${rollbackError.message}`, 'error')
      }
    }

    return {
      success: false,
      message: e.message,
      error: e
    }
  }
}

// 通知更新状态到前端
function notifyUpdateState() {
  const event = new CustomEvent('update-state-changed', {
    detail: { ...updateState }
  })
  window.dispatchEvent(event)
}

// 获取当前更新状态
function getUpdateState() {
  return { ...updateState }
}

// 重置更新状态
function resetUpdateState() {
  updateState = {
    status: UpdateStatus.IDLE,
    progress: 0,
    currentVersion: null,
    latestVersion: null,
    downloadUrl: null,
    checksum: null,
    backupPath: null,
    error: null
  }
  notifyUpdateState()
}

// 导出公共 API
export {
  UpdateStatus,
  checkForUpdates,
  performUpdate,
  getUpdateState,
  resetUpdateState,
  compareVersions,
  formatVersion
}
