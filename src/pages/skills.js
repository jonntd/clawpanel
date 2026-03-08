/**
 * Skills 页面 - Clawhub API 优化版
 * 直接从 Clawhub API 获取数据，支持分页和搜索
 */
import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

// Clawhub API 配置
const CLAWHUB_API_BASE = 'https://clawhub.ai/api/v1'

// 缓存数据
let skillsCache = null
let installedCache = null
let nextCursor = null
let currentQuery = ''
let isLoading = false
let currentPage = null

// 重置所有状态
function resetState() {
  skillsCache = null
  installedCache = null
  nextCursor = null
  currentQuery = ''
  isLoading = false
  currentPage = null
}

// 页面清理函数
export function cleanup() {
  resetState()
}

// 获取首字母
function getInitials(name) {
  if (!name) return '?'
  return name.charAt(0).toUpperCase()
}

// 获取颜色
function getColorForName(name) {
  const colors = [
    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatNumber(num) {
  if (!num && num !== 0) return '-'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toLocaleString()
}

// 格式化日期
function formatDate(timestamp) {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page skills-page'
  page.innerHTML = `
    <div class="skills-header">
      <h1 class="skills-title">Skills 管理</h1>
      <p class="skills-subtitle">浏览、搜索并安装 ClawHub 技能</p>
    </div>
    
    <div class="skills-toolbar">
      <div class="skills-search-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input class="skills-search-input" id="skill-search-input" placeholder="搜索技能，如 weather / github / summarize...">
      </div>
      <button class="skills-btn skills-btn-primary" data-action="skill-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        搜索
      </button>
      <button class="skills-btn skills-btn-secondary" data-action="skill-refresh">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
          <polyline points="23 4 23 10 17 10"/>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
        </svg>
        刷新
      </button>
    </div>
    
    <div class="skills-tabs">
      <button class="skills-tab active" data-tab="all" data-action="switch-tab">全部</button>
      <button class="skills-tab" data-tab="installed" data-action="switch-tab">已安装</button>
      <button class="skills-tab" data-tab="popular" data-action="switch-tab">热门</button>
      <button class="skills-tab" data-tab="newest" data-action="switch-tab">最新</button>
    </div>
    
    <div id="skills-content" class="skills-content">
      <div class="skills-loading">
        <div class="skills-loading-spinner"></div>
        <p>正在加载 Skills...</p>
      </div>
    </div>
    
    <div id="skill-detail-modal"></div>
  `

  // 检查是否是同一页面实例，如果不是则重置状态
  if (currentPage !== page) {
    resetState()
    currentPage = page
  }

  bindEvents(page)
  loadSkills(page)
  return page
}

// 从 Clawhub API 获取技能列表
async function fetchClawhubSkills({ sort = 'newest', limit = 20, cursor = null, search = '' } = {}) {
  const params = new URLSearchParams()
  params.append('sort', sort)
  params.append('limit', String(limit))
  // 添加时间戳防止缓存
  params.append('_t', Date.now())
  if (cursor) params.append('cursor', cursor)
  if (search) params.append('search', search)

  const url = `${CLAWHUB_API_BASE}/skills?${params.toString()}`
  console.log('[Skills] 请求 URL:', url)

  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json',
      'Cache-Control': 'no-cache'
    },
    cache: 'no-store'
  })

  console.log('[Skills] 响应状态:', response.status, response.statusText)

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }

  const data = await response.json()
  console.log('[Skills] 响应数据:', { itemCount: data.items?.length, hasNextCursor: !!data.nextCursor })
  return data
}

// 从 Clawhub API 获取单个技能详情
async function fetchClawhubSkillDetail(slug) {
  const url = `${CLAWHUB_API_BASE}/skills/${encodeURIComponent(slug)}`
  
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/json'
    }
  })
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`)
  }
  
  return await response.json()
}

async function loadSkills(page, options = {}) {
  const el = page.querySelector('#skills-content')
  if (!el) return
  
  // 如果正在加载，等待一段时间后重试
  if (isLoading) {
    console.log('[Skills] 正在加载中，等待...')
    setTimeout(() => loadSkills(page, options), 500)
    return
  }
  
  const { query = '', sort = 'newest', reset = false, tab = 'all' } = options
  
  if (reset) {
    nextCursor = null
    skillsCache = null
    installedCache = null
  }
  
  currentQuery = query
  isLoading = true
  
  // 显示加载状态
  if (!skillsCache || reset) {
    el.innerHTML = `
      <div class="skills-loading">
        <div class="skills-loading-spinner"></div>
        <p>正在加载 Skills...</p>
      </div>
    `
  }
  
  try {
    console.log('[Skills] 开始加载数据:', { query, sort, tab, reset, hasCache: !!skillsCache })
    
    // 并行加载已安装技能和 Clawhub 数据
    // 已安装标签页也需要加载 Clawhub 数据来获取描述信息
    const [installed, clawhubData] = await Promise.all([
      api.clawhubListInstalled().catch(err => {
        console.error('[Skills] 加载已安装技能失败:', err)
        return []
      }),
      fetchClawhubSkills({ 
        sort: sort === 'popular' ? 'popular' : 'newest', 
        limit: tab === 'installed' ? 100 : 20, // 已安装标签页加载更多数据
        cursor: reset ? null : nextCursor,
        search: query 
      }).catch(err => {
        console.error('[Skills] 加载 Clawhub 数据失败:', err)
        return { items: [] }
      })
    ])

    console.log('[Skills] 数据加载完成:', { 
      installedCount: installed.length, 
      clawhubCount: clawhubData.items?.length || 0,
      nextCursor: clawhubData.nextCursor 
    })

    installedCache = installed
    const installedSet = new Set(installed.map(x => x.slug))

    // 创建 Clawhub 数据映射，用于补充已安装技能的信息
    const clawhubMap = new Map((clawhubData.items || []).map(item => [item.slug, item]))

    // 合并数据
    let displaySkills = []

    if (tab === 'installed') {
      // 已安装标签：使用本地数据，但尝试从 Clawhub 补充描述
      displaySkills = installed.map(item => {
        // 如果本地没有描述，尝试从 Clawhub 数据获取
        const clawhubItem = clawhubMap.get(item.slug)
        const summary = item.summary || clawhubItem?.summary || ''
        
        return {
          ...item,
          summary,
          description: summary,
          displayName: item.displayName || clawhubItem?.displayName || item.slug,
          stats: item.stats || clawhubItem?.stats || {},
          updatedAt: item.updatedAt || clawhubItem?.updatedAt,
          isInstalled: true,
          source: 'local'
        }
      })
    } else {
      // 其他标签：显示 Clawhub 数据
      const clawhubSkills = (clawhubData.items || []).map(item => ({
        slug: item.slug,
        displayName: item.displayName,
        summary: item.summary,
        description: item.summary,
        downloads: item.stats?.downloads || 0,
        stars: item.stats?.stars || 0,
        versions: item.stats?.versions || 0,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
        latestVersion: item.latestVersion?.version,
        tags: item.tags,
        isInstalled: installedSet.has(item.slug),
        source: 'clawhub'
      }))
      
      // 如果有搜索词，直接显示搜索结果
      if (query) {
        displaySkills = clawhubSkills
      } else {
        // 合并已安装和 Clawhub 数据
        const skillsMap = new Map()
        
        // 先添加已安装的
        installed.forEach(item => {
          skillsMap.set(item.slug, {
            ...item,
            isInstalled: true,
            source: 'local'
          })
        })
        
        // 再添加 Clawhub 的（如果未安装）
        clawhubSkills.forEach(item => {
          if (!skillsMap.has(item.slug)) {
            skillsMap.set(item.slug, item)
          }
        })
        
        displaySkills = Array.from(skillsMap.values())
      }
      
      // 更新分页游标
      nextCursor = clawhubData.nextCursor || null
    }
    
    // 缓存数据
    if (!skillsCache || reset) {
      skillsCache = displaySkills
    } else {
      skillsCache = [...skillsCache, ...displaySkills.filter(s => !skillsCache.find(c => c.slug === s.slug))]
    }
    
    console.log('[Skills] 渲染数据:', { 
      displayCount: displaySkills.length, 
      cacheCount: skillsCache.length,
      tab,
      query 
    })
    
    renderSkills(el, { 
      skills: displaySkills, 
      installedSet, 
      hasMore: !!nextCursor && tab !== 'installed',
      tab,
      query 
    })
  } catch (e) {
    console.error('[Skills] 加载失败:', e)
    el.innerHTML = `
      <div class="skills-error">
        <div class="error-icon">⚠️</div>
        <p>加载失败: ${escapeHtml(e.message || '请稍后重试')}</p>
        <p class="empty-hint">请检查网络连接或稍后重试</p>
        <button class="skills-btn skills-btn-primary" data-action="skill-retry">重新加载</button>
      </div>
    `
  } finally {
    isLoading = false
    console.log('[Skills] 加载完成，isLoading 设置为 false')
  }
}

function renderSkillCard(item, installedSet) {
  const color = getColorForName(item.displayName || item.slug)
  const initial = getInitials(item.displayName || item.slug)
  const isInstalled = installedSet.has(item.slug)

  const desc = item.summary || item.description || ''
  const shortDesc = desc.length > 100 ? desc.slice(0, 100) + '...' : desc

  // 如果没有描述，显示提示信息
  const displayDesc = shortDesc || '暂无描述'
  
  const version = item.latestVersion || item.version || 'latest'
  
  return `
    <div class="skills-card" data-slug="${escapeHtml(item.slug)}" data-source="${item.source || 'clawhub'}">
      <div class="skills-card-main">
        <div class="skills-card-avatar" style="background:${color}">
          ${initial}
        </div>
        <div class="skills-card-content">
          <div class="skills-card-title-row">
            <h3 class="skills-card-title">${escapeHtml(item.displayName || item.slug)}</h3>
            ${isInstalled ? '<span class="skills-badge installed">已安装</span>' : ''}
          </div>
          <p class="skills-card-desc">${escapeHtml(displayDesc)}</p>
          <div class="skills-card-meta">
            <span class="skills-version">v${escapeHtml(version)}</span>
            ${item.updatedAt ? `<span class="skills-updated">${formatDate(item.updatedAt)}</span>` : ''}
          </div>
        </div>
      </div>
      <div class="skills-card-footer">
        <div class="skills-card-stats">
          <span class="skills-stat" title="下载量">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ${formatNumber(item.downloads || item.stats?.downloads)}
          </span>
          <span class="skills-stat" title="收藏">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            ${formatNumber(item.stars || item.stats?.stars)}
          </span>
        </div>
        <div class="skills-card-actions">
          <button class="skills-btn-icon" data-action="skill-inspect" data-slug="${escapeHtml(item.slug)}" title="查看详情">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="16" x2="12" y2="12"/>
              <line x1="12" y1="8" x2="12.01" y2="8"/>
            </svg>
          </button>
          ${isInstalled 
            ? `<button class="skills-btn-icon skills-btn-danger" data-action="skill-uninstall" data-slug="${escapeHtml(item.slug)}" title="卸载">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <polyline points="3 6 5 6 21 6"/>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
              </button>`
            : `<button class="skills-btn-icon skills-btn-install" data-action="skill-install" data-slug="${escapeHtml(item.slug)}" title="安装">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="7 10 12 15 17 10"/>
                  <line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
              </button>`}
        </div>
      </div>
    </div>
  `
}

function renderSkills(el, state) {
  const { skills = [], installedSet, hasMore = false, tab = 'all', query = '' } = state
  
  if (skills.length === 0) {
    el.innerHTML = `
      <div class="skills-empty">
        <div class="empty-icon">📦</div>
        <p>${query ? '没有找到匹配的技能' : tab === 'installed' ? '暂无已安装的技能' : '暂无技能数据'}</p>
        ${tab === 'installed' ? '<p class="empty-hint">去"全部"或"热门"标签浏览并安装技能</p>' : ''}
      </div>
    `
    return
  }

  const skillsHtml = skills.map(item => renderSkillCard(item, installedSet)).join('')
  
  const loadMoreBtn = hasMore ? `
    <div class="skills-load-more">
      <button class="skills-btn skills-btn-secondary" data-action="load-more">
        加载更多
      </button>
    </div>
  ` : ''
  
  el.innerHTML = `
    <div class="skills-section">
      <div class="skills-section-header">
        <h2 class="skills-section-title">${query ? '搜索结果' : tab === 'installed' ? '已安装技能' : tab === 'popular' ? '热门技能' : '最新技能'}</h2>
        <span class="skills-count">共 ${skills.length} 个</span>
      </div>
      <div class="skills-grid">
        ${skillsHtml}
      </div>
      ${loadMoreBtn}
    </div>
  `
  
  // 绑定卡片点击事件
  el.querySelectorAll('.skills-card').forEach(card => {
    card.addEventListener('click', (e) => {
      // 如果点击的是按钮，不触发卡片点击
      if (e.target.closest('.skills-btn-icon') || e.target.closest('.skills-btn')) return
      
      const slug = card.dataset.slug
      showSkillDetail(el, slug, installedSet)
    })
  })
}

async function showSkillDetail(el, slug, installedSet) {
  const modal = document.querySelector('#skill-detail-modal')
  if (!modal) return
  
  modal.innerHTML = `
    <div class="skills-modal-overlay" data-action="close-modal">
      <div class="skills-modal-content" onclick="event.stopPropagation()">
        <div class="skills-modal-header">
          <div class="skills-modal-title">加载中...</div>
          <button class="skills-modal-close" data-action="close-modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div class="skills-modal-body">
          <div class="skills-loading">
            <div class="skills-loading-spinner"></div>
            <p>正在加载详情...</p>
          </div>
        </div>
      </div>
    </div>
  `
  
  try {
    // 优先从 Clawhub API 获取详情
    let data
    try {
      data = await fetchClawhubSkillDetail(slug)
    } catch (e) {
      // 如果 Clawhub 获取失败，尝试本地 API
      data = await api.clawhubInspect(slug)
    }
    
    const skill = data?.skill || data || {}
    const owner = data?.owner || {}
    const version = data?.latestVersion || skill?.latestVersion || {}
    const isInstalled = installedSet.has(slug)
    
    const color = getColorForName(skill.displayName || slug)
    const initial = getInitials(skill.displayName || slug)
    
    modal.innerHTML = `
      <div class="skills-modal-overlay" data-action="close-modal">
        <div class="skills-modal-content" onclick="event.stopPropagation()">
          <div class="skills-modal-header">
            <div class="skills-modal-avatar" style="background:${color}">${initial}</div>
            <div class="skills-modal-info">
              <div class="skills-modal-title">${escapeHtml(skill.displayName || slug)}</div>
              <div class="skills-modal-meta">${escapeHtml(slug)} · @${escapeHtml(owner.handle || 'unknown')} · v${escapeHtml(version.version || skill.latestVersion || 'latest')}</div>
            </div>
            <button class="skills-modal-close" data-action="close-modal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="skills-modal-body">
            <div class="skills-modal-desc">${escapeHtml(skill.summary || skill.description || '暂无描述')}</div>
            
            ${version.changelog ? `
            <div class="skills-modal-section">
              <h4 class="skills-modal-section-title">更新日志</h4>
              <div class="skills-modal-changelog">${escapeHtml(version.changelog)}</div>
            </div>
            ` : ''}
            
            <div class="skills-modal-stats">
              <div class="skills-modal-stat">
                <div class="stat-value">${formatNumber(skill.stats?.downloads || skill.downloads)}</div>
                <div class="stat-label">下载量</div>
              </div>
              <div class="skills-modal-stat">
                <div class="stat-value">${formatNumber(skill.stats?.stars || skill.stars)}</div>
                <div class="stat-label">收藏</div>
              </div>
              <div class="skills-modal-stat">
                <div class="stat-value">${formatNumber(skill.stats?.installsCurrent || skill.installsCurrent || 0)}</div>
                <div class="stat-label">安装量</div>
              </div>
              <div class="skills-modal-stat">
                <div class="stat-value">${formatNumber(skill.stats?.versions || skill.versions || 1)}</div>
                <div class="stat-label">版本数</div>
              </div>
            </div>
            
            <div class="skills-modal-actions">
              ${isInstalled 
                ? `<button class="skills-btn skills-btn-danger skills-btn-large" data-action="skill-uninstall" data-slug="${escapeHtml(slug)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    卸载技能
                  </button>`
                : `<button class="skills-btn skills-btn-primary skills-btn-large" data-action="skill-install" data-slug="${escapeHtml(slug)}">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="7 10 12 15 17 10"/>
                      <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    安装技能
                  </button>`}
            </div>
          </div>
        </div>
      </div>
    `
  } catch (e) {
    modal.innerHTML = `
      <div class="skills-modal-overlay" data-action="close-modal">
        <div class="skills-modal-content" onclick="event.stopPropagation()">
          <div class="skills-modal-header">
            <div class="skills-modal-title">加载失败</div>
            <button class="skills-modal-close" data-action="close-modal">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
                <line x1="18" y1="6" x2="6" y2="18"/>
                <line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
          <div class="skills-modal-body">
            <div class="skills-error">${escapeHtml(e.message || '加载详情失败')}</div>
          </div>
        </div>
      </div>
    `
  }
  
  // 绑定关闭事件
  modal.querySelectorAll('[data-action="close-modal"]').forEach(el => {
    el.addEventListener('click', () => {
      modal.innerHTML = ''
    })
  })
}

async function handleInstall(page, slug) {
  const btn = page.querySelector(`[data-action="skill-install"][data-slug="${slug}"]`)
  if (btn) {
    btn.disabled = true
    const originalContent = btn.innerHTML
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" class="spinning">
        <circle cx="12" cy="12" r="10"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    `
    
    try {
      await api.clawhubInstall(slug)
      toast(`Skill ${slug} 安装成功`, 'success')
      // 刷新列表
      const activeTab = page.querySelector('.skills-tab.active')?.dataset.tab || 'all'
      const query = page.querySelector('#skill-search-input')?.value?.trim() || ''
      await loadSkills(page, { query, tab: activeTab, reset: true })
    } catch (e) {
      const message = (e?.message || String(e || '')).trim()
      const friendly = message.includes('Rate limit exceeded')
        ? 'ClawHub 当前限流了，稍后再试'
        : `安装失败: ${message || '未知错误'}`
      toast(friendly, 'error')
      btn.disabled = false
      btn.innerHTML = originalContent
    }
  }
}

async function handleUninstall(page, slug) {
  // 这里需要确认是否有卸载 API
  toast('卸载功能需要后端支持', 'warning')
}

function bindEvents(page) {
  // 标签切换
  page.querySelectorAll('.skills-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      // 更新激活状态
      page.querySelectorAll('.skills-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      
      const tabName = tab.dataset.tab
      const query = page.querySelector('#skill-search-input')?.value?.trim() || ''
      
      await loadSkills(page, { 
        query, 
        tab: tabName, 
        sort: tabName === 'popular' ? 'popular' : 'newest',
        reset: true 
      })
    })
  })
  
  // 其他事件委托
  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]')
    if (!btn) return
    const action = btn.dataset.action
    const slug = btn.dataset.slug
    
    switch (action) {
      case 'skill-search':
        await loadSkills(page, { 
          query: page.querySelector('#skill-search-input')?.value?.trim() || '',
          reset: true 
        })
        break
      case 'skill-refresh':
      case 'skill-retry':
        const activeTab = page.querySelector('.skills-tab.active')?.dataset.tab || 'all'
        await loadSkills(page, { 
          query: page.querySelector('#skill-search-input')?.value?.trim() || '',
          tab: activeTab,
          reset: true 
        })
        break
      case 'skill-inspect':
        if (slug) {
          const el = page.querySelector('#skills-content')
          const installedSet = new Set((installedCache || []).map(x => x.slug))
          showSkillDetail(el, slug, installedSet)
        }
        break
      case 'skill-install':
        if (slug) await handleInstall(page, slug)
        break
      case 'skill-uninstall':
        if (slug) await handleUninstall(page, slug)
        break
      case 'close-modal':
        const modal = document.querySelector('#skill-detail-modal')
        if (modal) modal.innerHTML = ''
        break
      case 'load-more':
        const currentTab = page.querySelector('.skills-tab.active')?.dataset.tab || 'all'
        await loadSkills(page, { 
          query: currentQuery,
          tab: currentTab,
          reset: false 
        })
        break
    }
  })

  page.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' && e.target?.id === 'skill-search-input') {
      e.preventDefault()
      await loadSkills(page, { 
        query: e.target.value.trim(),
        reset: true 
      })
    }
  })
}
