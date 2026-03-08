/**
 * 自动更新页面
 * 显示更新进度、状态和操作按钮
 */

import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'
import { icon } from '../lib/icons.js'

export async function render() {
  const page = document.createElement('div')
  page.className = 'page update-page'

  page.innerHTML = `
    <div class="page-header">
      <h1 class="page-title">系统更新</h1>
      <p class="page-desc">检查并安装最新版本的 ClawPanel</p>
    </div>

    <div class="update-section">
      <div class="update-status-card" id="update-status-card">
        <div class="update-status-header">
          <div class="update-status-icon" id="update-status-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="32" height="32">
              <circle cx="12" cy="12" r="10"/>
              <path d="M12 6v6m-3 3h6m-3-3v6"/>
            </svg>
          </div>
          <div class="update-status-content">
            <h2 class="update-status-title" id="update-status-title">检查更新中...</h2>
            <p class="update-status-desc" id="update-status-desc">正在连接 GitHub API 检查最新版本</p>
          </div>
        </div>
      </div>

      <div class="update-info-card" id="update-info-card" style="display:none">
        <div class="update-info-row">
          <span class="update-info-label">当前版本</span>
          <span class="update-info-value" id="current-version">-</span>
        </div>
        <div class="update-info-row">
          <span class="update-info-label">最新版本</span>
          <span class="update-info-value" id="latest-version">-</span>
        </div>
        <div class="update-info-row">
          <span class="update-info-label">发布时间</span>
          <span class="update-info-value" id="published-at">-</span>
        </div>
      </div>

      <div class="update-progress-card" id="update-progress-card" style="display:none">
        <div class="update-progress-header">
          <span class="update-progress-label" id="update-progress-label">下载中...</span>
          <span class="update-progress-percent" id="update-progress-percent">0%</span>
        </div>
        <div class="update-progress-bar-container">
          <div class="update-progress-bar" id="update-progress-bar" style="width:0%"></div>
        </div>
        <div class="update-progress-log" id="update-progress-log"></div>
      </div>

      <div class="update-actions-card" id="update-actions-card" style="display:none">
        <button class="btn btn-primary" id="btn-check-update">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:8px">
            <path d="M21 21v-8a2 2 0 00-2 2H5a2 2 0 00-2 2v5a2 2 0 00-2 2h14a2 2 0 00-2 2z"/>
            <path d="M12 9v-2m-2 2h4m2 2v4m-2-2v-2"/>
          </svg>
          检查更新
        </button>
        <button class="btn btn-success" id="btn-download-update" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:8px">
            <path d="M21 15v4a2 2 0 00-2 2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h14a2 2 0 00-2 2z"/>
            <path d="M7 10a5 5 0 11-5 5v2a5 5 0 11-5 5H7v-2a5 5 0 11-5 5z"/>
          </svg>
          下载更新
        </button>
        <button class="btn btn-warning" id="btn-rollback" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:8px">
            <path d="M3 10h11a2 2 0 00-2 2v11a2 2 0 00-2 2H3a2 2 0 00-2 2v-11a2 2 0 00-2 2z"/>
            <path d="M12 5l-7 7-7 7"/>
          </svg>
          回滚版本
        </button>
        <button class="btn btn-secondary" id="btn-close" style="display:none">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" style="margin-right:8px">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
          关闭
        </button>
      </div>

      <div class="update-release-notes" id="update-release-notes" style="display:none">
        <h3>更新说明</h3>
        <div id="release-notes-content"></div>
      </div>
    </div>
  `

  // 绑定事件
  bindEvents(page)

  // 初始检查更新
  setTimeout(() => checkForUpdates(page), 500)

  return page
}

function bindEvents(page) {
  const btnCheck = page.querySelector('#btn-check-update')
  const btnDownload = page.querySelector('#btn-download-update')
  const btnRollback = page.querySelector('#btn-rollback')
  const btnClose = page.querySelector('#btn-close')

  btnCheck?.addEventListener('click', () => checkForUpdates(page))
  btnDownload?.addEventListener('click', () => performUpdate(page))
  btnRollback?.addEventListener('click', () => rollbackUpdate(page))
  btnClose?.addEventListener('click', () => {
    page.querySelector('#update-actions-card').style.display = 'none'
  })

  // 监听更新状态变化
  window.addEventListener('update-state-changed', (e) => {
    const state = e.detail
    updateUI(page, state)
  })
}

async function checkForUpdates(page) {
  try {
    const btnCheck = page.querySelector('#btn-check-update')
    btnCheck.disabled = true
    btnCheck.textContent = '检查中...'

    const info = await api.checkPanelUpdate()

    btnCheck.disabled = false
    btnCheck.textContent = '检查更新'

    if (info.latest && info.latest !== 'unknown') {
      // 有新版本
      showUpdateAvailable(page, info)
    } else {
      // 已是最新
      showUpToDate(page, info)
    }
  } catch (e) {
    console.error('[UpdatePage] 检查更新失败:', e)
    toast('检查更新失败: ' + e.message, 'error')
    btnCheck.disabled = false
    btnCheck.textContent = '检查更新'
  }
}

async function performUpdate(page) {
  try {
    const btnDownload = page.querySelector('#btn-download-update')
    btnDownload.disabled = true
    btnDownload.textContent = '准备中...'

    // 这里应该调用完整的更新流程
    // 实际实现需要根据具体需求调整
    toast('更新功能正在开发中', 'info')

    btnDownload.disabled = false
    btnDownload.textContent = '下载更新'
  } catch (e) {
    console.error('[UpdatePage] 执行更新失败:', e)
    toast('更新失败: ' + e.message, 'error')
    btnDownload.disabled = false
    btnDownload.textContent = '下载更新'
  }
}

async function rollbackUpdate(page) {
  try {
    const btnRollback = page.querySelector('#btn-rollback')
    btnRollback.disabled = true
    btnRollback.textContent = '回滚中...'

    // 这里应该调用回滚功能
    // 实际实现需要根据具体需求调整
    toast('回滚功能正在开发中', 'info')

    btnRollback.disabled = false
    btnRollback.textContent = '回滚版本'
  } catch (e) {
    console.error('[UpdatePage] 回滚失败:', e)
    toast('回滚失败: ' + e.message, 'error')
    btnRollback.disabled = false
    btnRollback.textContent = '回滚版本'
  }
}

function showUpdateAvailable(page, info) {
  const statusIcon = page.querySelector('#update-status-icon')
  const statusTitle = page.querySelector('#update-status-title')
  const statusDesc = page.querySelector('#update-status-desc')

  statusIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" width="32" height="32">
      <path d="M12 22s-10 10l-9-9 9-9"/>
      <path d="M12 6v6m-3 3h6m-3-3v6"/>
    </svg>
  `
  statusTitle.textContent = '发现新版本'
  statusDesc.textContent = `最新版本 ${info.latest} 已发布，建议立即更新`

  // 显示版本信息
  const infoCard = page.querySelector('#update-info-card')
  infoCard.style.display = 'block'
  page.querySelector('#current-version').textContent = info.current || '未知'
  page.querySelector('#latest-version').textContent = info.latest
  page.querySelector('#published-at').textContent = formatPublishedAt(info.published_at)

  // 显示下载按钮
  const actionsCard = page.querySelector('#update-actions-card')
  actionsCard.style.display = 'flex'
  page.querySelector('#btn-download-update').style.display = 'inline-flex'
  page.querySelector('#btn-check-update').style.display = 'none'

  // 显示更新说明
  if (info.release_notes) {
    const notesCard = page.querySelector('#update-release-notes')
    notesCard.style.display = 'block'
    page.querySelector('#release-notes-content').textContent = info.release_notes
  }
}

function showUpToDate(page, info) {
  const statusIcon = page.querySelector('#update-status-icon')
  const statusTitle = page.querySelector('#update-status-title')
  const statusDesc = page.querySelector('#update-status-desc')

  statusIcon.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" width="32" height="32">
      <path d="M20 6L9 17l-5-5 5-5"/>
      <path d="M12 9v-2m-2 2h4m2 2v4m-2-2v-2"/>
    </svg>
  `
  statusTitle.textContent = '已是最新版本'
  statusDesc.textContent = '当前安装的版本已是最新版本'

  // 显示版本信息
  const infoCard = page.querySelector('#update-info-card')
  infoCard.style.display = 'block'
  
  // 填充版本信息
  if (info) {
    page.querySelector('#current-version').textContent = info.current || '未知'
    page.querySelector('#latest-version').textContent = info.latest || '未知'
    page.querySelector('#published-at').textContent = formatPublishedAt(info.published_at)
  }

  // 隐藏操作按钮
  const actionsCard = page.querySelector('#update-actions-card')
  actionsCard.style.display = 'none'
}

function updateUI(page, state) {
  const statusIcon = page.querySelector('#update-status-icon')
  const statusTitle = page.querySelector('#update-status-title')
  const statusDesc = page.querySelector('#update-status-desc')
  const progressCard = page.querySelector('#update-progress-card')
  const progressBar = page.querySelector('#update-progress-bar')
  const progressPercent = page.querySelector('#update-progress-percent')
  const progressLabel = page.querySelector('#update-progress-label')
  const progressLog = page.querySelector('#update-progress-log')

  switch (state.status) {
    case 'checking':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="32" height="32">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6m-3 3h6m-3-3v6"/>
        </svg>
      `
      statusTitle.textContent = '检查更新中...'
      statusDesc.textContent = '正在连接 GitHub API 检查最新版本'
      progressCard.style.display = 'none'
      break

    case 'downloading':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="32" height="32">
          <path d="M21 15v4a2 2 0 00-2 2H5a2 2 0 00-2 2v4a2 2 0 00-2 2z"/>
          <path d="M7 10a5 5 0 11-5 5v2a5 5 0 11-5 5H7v-2a5 5 0 11-5 5z"/>
        </svg>
      `
      statusTitle.textContent = '下载更新包...'
      statusDesc.textContent = `正在下载版本 ${state.latestVersion || '最新'}`
      progressCard.style.display = 'block'
      progressLabel.textContent = '下载中'
      progressBar.style.width = `${state.progress}%`
      progressPercent.textContent = `${state.progress}%`
      break

    case 'verifying':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" width="32" height="32">
          <path d="M12 22s-10 10l-9-9 9-9"/>
          <path d="M12 9v-2m-2 2h4m2 2v4m-2-2v-2"/>
        </svg>
      `
      statusTitle.textContent = '验证文件完整性...'
      statusDesc.textContent = '正在验证下载文件的校验和'
      progressCard.style.display = 'block'
      progressLabel.textContent = '验证中'
      progressBar.style.width = `${state.progress}%`
      progressPercent.textContent = `${state.progress}%`
      break

    case 'installing':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" width="32" height="32">
          <path d="M12 22s-10 10l-9-9 9-9"/>
          <path d="M12 9v-2m-2 2h4m2 2v4m-2-2v-2"/>
        </svg>
      `
      statusTitle.textContent = '安装更新...'
      statusDesc.textContent = '正在安装新版本'
      progressCard.style.display = 'block'
      progressLabel.textContent = '安装中'
      progressBar.style.width = `${state.progress}%`
      progressPercent.textContent = `${state.progress}%`
      break

    case 'validating':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" width="32" height="32">
          <path d="M12 22s-10 10l-9-9 9-9"/>
          <path d="M12 9v-2m-2 2h4m2 2v4m-2-2v-2"/>
        </svg>
      `
      statusTitle.textContent = '验证更新...'
      statusDesc.textContent = '正在验证安装是否成功'
      progressCard.style.display = 'block'
      progressLabel.textContent = '验证中'
      progressBar.style.width = `${state.progress}%`
      progressPercent.textContent = `${state.progress}%`
      break

    case 'success':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2" width="32" height="32">
          <path d="M20 6L9 17l-5-5 5-5"/>
          <path d="M12 9v-2m-2 2h4m2 2v4m-2-2v-2"/>
        </svg>
      `
      statusTitle.textContent = '更新成功'
      statusDesc.textContent = '已成功更新到最新版本'
      progressCard.style.display = 'none'
      toast('更新成功！', 'success')
      break

    case 'failed':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--error)" stroke-width="2" width="32" height="32">
          <circle cx="12" cy="12" r="10"/>
          <line x1="15" y1="9" x2="9" y2="15"/>
        </svg>
      `
      statusTitle.textContent = '更新失败'
      statusDesc.textContent = state.error || '未知错误'
      progressCard.style.display = 'none'
      toast(`更新失败: ${state.error || '未知错误'}`, 'error')
      break

    case 'rollback':
      statusIcon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--warning)" stroke-width="2" width="32" height="32">
          <path d="M3 10h11a2 2 0 00-2 2v11a2 2 0 00-2 2H3a2 2 0 00-2 2z"/>
          <path d="M12 5l-7 7-7 7"/>
        </svg>
      `
      statusTitle.textContent = '回滚中...'
      statusDesc.textContent = '正在恢复到备份版本'
      progressCard.style.display = 'block'
      progressLabel.textContent = '回滚中'
      progressBar.style.width = `${state.progress}%`
      progressPercent.textContent = `${state.progress}%`
      break
  }
}

function formatPublishedAt(dateStr) {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })
}
