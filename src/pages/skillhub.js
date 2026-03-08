/**
 * SkillHub 页面
 * 专为中国用户优化的 Skills 社区
 * 界面风格参考: skillhub.tencent.com
 */

import { api } from '../lib/tauri-api.js'
import { toast } from '../components/toast.js'

// SkillHub 数据 URL
const SKILLHUB_DATA_URL = '/data/skillhub-data.json'

// 缓存数据
let skillsCache = null
let categoriesCache = null
let featuredCache = null

// 分帧渲染队列，避免阻塞主线程
const _renderQueue = []
let _renderFrameId = null

function scheduleRender(fn) {
  _renderQueue.push(fn)
  if (!_renderFrameId) {
    _renderFrameId = requestAnimationFrame(() => {
      _renderFrameId = null
      const queue = _renderQueue.splice(0, _renderQueue.length)
      queue.forEach(fn => fn())
    })
  }
}

// 分类配置 - 使用更简洁的图标
const CATEGORIES = [
  { id: 'all', name: '全部', icon: '🔥', color: '#FF6B6B', bgColor: '#FFF5F5' },
  { id: 'AI 智能', name: 'AI 智能', icon: '🤖', color: '#3B82F6', bgColor: '#EFF6FF' },
  { id: '开发工具', name: '开发工具', icon: '💻', color: '#10B981', bgColor: '#ECFDF5' },
  { id: '效率提升', name: '效率提升', icon: '⚡', color: '#F59E0B', bgColor: '#FFFBEB' },
  { id: '数据分析', name: '数据分析', icon: '📊', color: '#8B5CF6', bgColor: '#F5F3FF' },
  { id: '内容创作', name: '内容创作', icon: '✍️', color: '#EC4899', bgColor: '#FDF2F8' },
  { id: '安全合规', name: '安全合规', icon: '🛡️', color: '#EF4444', bgColor: '#FEF2F2' },
  { id: 'Web3 & 区块链', name: 'Web3 & 区块链', icon: '🔗', color: '#6366F1', bgColor: '#EEF2FF' },
  { id: '通讯协作', name: '通讯协作', icon: '💬', color: '#06B6D4', bgColor: '#ECFEFF' },
]

function escapeHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

// 格式化数字
function formatNumber(num) {
  if (!num) return '0'
  if (num >= 10000) {
    return (num / 10000).toFixed(1) + '万'
  }
  return num.toLocaleString()
}

// 格式化时间
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now - date
  
  if (diff < 3600000) {
    const mins = Math.floor(diff / 60000)
    return mins < 1 ? '刚刚' : `${mins}分钟前`
  }
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)}小时前`
  }
  if (diff < 2592000000) {
    return `${Math.floor(diff / 86400000)}天前`
  }
  if (diff < 31536000000) {
    return `${Math.floor(diff / 2592000000)}个月前`
  }
  return `${Math.floor(diff / 31536000000)}年前`
}

// 根据 tags 推断技能所属的分类
function inferCategories(tags, categoriesMap) {
  const categories = []
  const skillTags = new Set(tags.map(t => t.toLowerCase()))
  
  for (const [categoryName, categoryTags] of Object.entries(categoriesMap)) {
    for (const tag of categoryTags) {
      if (skillTags.has(tag.toLowerCase())) {
        categories.push(categoryName)
        break
      }
    }
  }
  
  return categories
}

// 加载技能数据
async function loadSkills() {
  if (skillsCache) return { skills: skillsCache, categories: categoriesCache, featured: featuredCache }
  
  try {
    const response = await fetch(SKILLHUB_DATA_URL)
    const data = await response.json()
    
    const categoriesMap = data.categories || {}
    const skills = []
    
    if (data.skills && Array.isArray(data.skills)) {
      data.skills.forEach(skill => {
        const tags = skill.tags || []
        // 根据 tags 推断分类
        const categories = inferCategories(tags, categoriesMap)
        
        skills.push({
          id: skill.slug || skill.name,
          name: skill.name,
          displayName: skill.name,
          description: skill.description_zh || skill.description || '',
          summary: skill.description_zh || skill.description || '',
          version: skill.version || '1.0.0',
          downloads: skill.downloads || 0,
          stars: skill.stars || 0,
          installs: skill.installs || 0,
          author: skill.author || '',
          tags: tags,
          categories: categories,
          homepage: skill.homepage || '',
          score: skill.score || 0,
          updatedAt: skill.updated_at || 0
        })
      })
    }
    
    skills.sort((a, b) => (b.score || 0) - (a.score || 0))
    
    skillsCache = skills
    categoriesCache = categoriesMap
    featuredCache = data.featured || []
    
    return { skills, categories: categoriesMap, featured: data.featured || [] }
  } catch (e) {
    console.error('加载技能数据失败:', e)
    throw e
  }
}

// 渲染技能卡片 - 匹配截图风格
function renderSkillCard(skill) {
  const color = getColorForName(skill.displayName || skill.name)
  const initial = getInitials(skill.displayName || skill.name)
  
  // 截断描述
  const desc = skill.summary || skill.description || ''
  const shortDesc = desc.length > 60 ? desc.slice(0, 60) + '...' : desc
  
  // 生成标签 HTML（只显示第一个标签）
  const tagHtml = skill.tags && skill.tags.length > 0 
    ? `<span class="skillhub-tag">${escapeHtml(skill.tags[0])}</span>` 
    : ''
  
  return `
    <div class="skillhub-card" data-skill-id="${escapeHtml(skill.id)}">
      <div class="skillhub-card-main">
        <div class="skillhub-card-avatar" style="background:${color}">
          ${initial}
        </div>
        <div class="skillhub-card-content">
          <div class="skillhub-card-title-row">
            <h3 class="skillhub-card-title">${escapeHtml(skill.displayName || skill.name)}</h3>
            ${tagHtml}
          </div>
          <p class="skillhub-card-desc">${escapeHtml(shortDesc)}</p>
        </div>
      </div>
      <div class="skillhub-card-footer">
        <div class="skillhub-card-stats">
          <span class="skillhub-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            ${formatNumber(skill.downloads)}
          </span>
          <span class="skillhub-stat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
            </svg>
            ${formatNumber(skill.stars)}
          </span>
        </div>
        <span class="skillhub-card-version">v${escapeHtml(skill.version)}</span>
      </div>
    </div>
  `
}

// 显示技能详情弹窗
function showSkillDetail(skill, allSkills) {
  const color = getColorForName(skill.displayName || skill.name)
  const initial = getInitials(skill.displayName || skill.name)
  
  const tagsHtml = (skill.tags || []).map(tag => 
    `<span class="skillhub-tag">${escapeHtml(tag)}</span>`
  ).join('')
  
  const categoriesHtml = (skill.categories || []).map(cat => 
    `<span class="skillhub-category-tag">${escapeHtml(cat)}</span>`
  ).join('')
  
  const modal = document.createElement('div')
  modal.className = 'skillhub-modal'
  modal.innerHTML = `
    <div class="skillhub-modal-overlay"></div>
    <div class="skillhub-modal-content">
      <div class="skillhub-modal-header">
        <div class="skillhub-modal-avatar" style="background:${color}">
          ${initial}
        </div>
        <div class="skillhub-modal-info">
          <h2>${escapeHtml(skill.displayName || skill.name)}</h2>
          <p class="skillhub-modal-id">${escapeHtml(skill.id)}</p>
          ${categoriesHtml ? `<div class="skillhub-modal-categories">${categoriesHtml}</div>` : ''}
        </div>
        <button class="skillhub-modal-close" title="关闭">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            <line x1="18" y1="6" x2="6" y2="18"/>
            <line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      
      <div class="skillhub-modal-body">
        ${tagsHtml ? `<div class="skillhub-modal-tags">${tagsHtml}</div>` : ''}
        
        <p class="skillhub-modal-desc">${escapeHtml(skill.description || skill.summary || '暂无描述')}</p>
        
        <div class="skillhub-stats-grid">
          <div class="skillhub-stat-card">
            <div class="stat-value">${formatNumber(skill.downloads)}</div>
            <div class="stat-label">下载量</div>
          </div>
          <div class="skillhub-stat-card">
            <div class="stat-value">${formatNumber(skill.stars)}</div>
            <div class="stat-label">收藏</div>
          </div>
          <div class="skillhub-stat-card">
            <div class="stat-value">${formatNumber(skill.installs)}</div>
            <div class="stat-label">安装量</div>
          </div>
          <div class="skillhub-stat-card">
            <div class="stat-value">${formatNumber(skill.score)}</div>
            <div class="stat-label">综合评分</div>
          </div>
        </div>
        
        <div class="skillhub-install-section">
          <h4>🚀 快速安装</h4>
          <div class="skillhub-install-tabs">
            <button class="skillhub-tab active" data-tab="fast">
              <span class="tab-icon">⚡</span>
              <span>SkillHub</span>
              <span class="tab-badge">推荐</span>
            </button>
            <button class="skillhub-tab" data-tab="cli">
              <span class="tab-icon">💻</span>
              <span>CLI</span>
            </button>
          </div>
          
          <div class="skillhub-install-content active" id="tab-fast">
            <p class="install-desc">通过 SkillHub 国内镜像加速安装</p>
            <div class="install-steps">
              <div class="install-step">
                <div class="step-number">1</div>
                <div class="step-content">
                  <div class="step-label">安装 SkillHub CLI</div>
                  <div class="code-block">
                    <code>curl -fsSL https://skillhub-1251783334.cos.ap-guangzhou.myqcloud.com/install.sh | bash</code>
                    <button class="copy-btn" data-code="curl -fsSL https://skillhub-1251783334.cos.ap-guangzhou.myqcloud.com/install.sh | bash">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      复制
                    </button>
                  </div>
                </div>
              </div>
              <div class="install-step">
                <div class="step-number">2</div>
                <div class="step-content">
                  <div class="step-label">安装技能</div>
                  <div class="code-block">
                    <code>skillhub install ${escapeHtml(skill.id)}</code>
                    <button class="copy-btn" data-code="skillhub install ${escapeHtml(skill.id)}">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                      </svg>
                      复制
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div class="skillhub-install-content" id="tab-cli">
            <p class="install-desc">使用 OpenClaw CLI 直接安装</p>
            <div class="code-block">
              <code>openclaw skill install ${escapeHtml(skill.id)}</code>
              <button class="copy-btn" data-code="openclaw skill install ${escapeHtml(skill.id)}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                复制
              </button>
            </div>
          </div>
        </div>
        
        ${skill.homepage ? `
        <div class="skillhub-modal-actions">
          <a href="${escapeHtml(skill.homepage)}" target="_blank" class="skillhub-btn skillhub-btn-primary">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            访问主页
          </a>
        </div>
        ` : ''}
      </div>
    </div>
  `
  
  document.body.appendChild(modal)
  
  const closeModal = () => modal.remove()
  modal.querySelector('.skillhub-modal-close').addEventListener('click', closeModal)
  modal.querySelector('.skillhub-modal-overlay').addEventListener('click', closeModal)
  
  const handleEsc = (e) => {
    if (e.key === 'Escape') {
      closeModal()
      document.removeEventListener('keydown', handleEsc)
    }
  }
  document.addEventListener('keydown', handleEsc)
  
  modal.querySelectorAll('.skillhub-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      modal.querySelectorAll('.skillhub-tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      modal.querySelectorAll('.skillhub-install-content').forEach(c => c.classList.remove('active'))
      modal.querySelector(`#tab-${tab.dataset.tab}`).classList.add('active')
    })
  })
  
  modal.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const code = btn.dataset.code
      try {
        await navigator.clipboard.writeText(code)
        toast.success('已复制到剪贴板')
      } catch (err) {
        const textarea = document.createElement('textarea')
        textarea.value = code
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand('copy')
        document.body.removeChild(textarea)
        toast.success('已复制到剪贴板')
      }
    })
  })
}

export async function render() {
  const page = document.createElement('div')
  page.className = 'page skillhub-page'
  
  page.innerHTML = `
    <!-- 分类导航 -->
    <div class="skillhub-categories">
      ${CATEGORIES.map(cat => `
        <div class="skillhub-category ${cat.id === 'all' ? 'active' : ''}" data-category="${cat.id}">
          <div class="category-icon" style="background: ${cat.bgColor}; color: ${cat.color}">
            ${cat.icon}
          </div>
          <span class="category-name">${cat.name}</span>
        </div>
      `).join('')}
    </div>
    
    <!-- 搜索栏 -->
    <div class="skillhub-search-bar">
      <div class="skillhub-search-input-wrap">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.35-4.35"/>
        </svg>
        <input type="text" id="skillhub-search-input" placeholder="搜索关键词..." class="skillhub-search-input">
      </div>
      <div class="skillhub-sort">
        <select id="skillhub-sort" class="skillhub-sort-select">
          <option value="featured">综合排序</option>
          <option value="downloads">下载量</option>
          <option value="stars">收藏数</option>
          <option value="installs">安装量</option>
          <option value="score">综合评分</option>
        </select>
      </div>
    </div>
    
    <!-- 技能网格 -->
    <div id="skillhub-grid" class="skillhub-grid">
      <div class="skillhub-loading">
        <div class="loading-spinner"></div>
        <p>正在加载技能列表...</p>
      </div>
    </div>
    
    <!-- 分页 -->
    <div class="skillhub-pagination" id="pagination" style="display:none">
      <button class="pagination-btn" id="load-more">加载更多</button>
    </div>
  `
  
  const grid = page.querySelector('#skillhub-grid')
  const searchInput = page.querySelector('#skillhub-search-input')
  const sortSelect = page.querySelector('#skillhub-sort')
  const categoryEls = page.querySelectorAll('.skillhub-category')
  
  let allSkills = []
  let filteredSkills = []
  let currentCategory = 'all'
  let currentPage = 1
  const pageSize = 24
  
  try {
    const { skills } = await loadSkills()
    allSkills = skills
    filteredSkills = skills
    renderSkills(filteredSkills, true)
  } catch (e) {
    console.error('加载失败:', e)
    grid.innerHTML = `
      <div class="skillhub-error">
        <div class="error-icon">⚠️</div>
        <p>加载失败，请稍后重试</p>
        <button class="btn btn-primary" onclick="location.reload()">重新加载</button>
      </div>
    `
  }
  
  function renderSkills(skills, reset = false) {
    if (reset) {
      grid.innerHTML = ''
      currentPage = 1
    }

    if (skills.length === 0) {
      grid.innerHTML = `
        <div class="skillhub-empty">
          <div class="empty-icon">🔍</div>
          <p>没有找到匹配的技能</p>
        </div>
      `
      return
    }

    const start = (currentPage - 1) * pageSize
    const end = start + pageSize
    const pageSkills = skills.slice(start, end)

    // 分帧渲染：将卡片分批处理，每帧渲染 6 个，避免阻塞 UI
    const BATCH_SIZE = 6
    const totalBatches = Math.ceil(pageSkills.length / BATCH_SIZE)

    // 移除旧的空状态（如果存在）
    const emptyEl = grid.querySelector('.skillhub-empty')
    if (emptyEl) emptyEl.remove()

    // 分批渲染卡片
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      scheduleRender(() => {
        const batchStart = batchIndex * BATCH_SIZE
        const batchEnd = Math.min(batchStart + BATCH_SIZE, pageSkills.length)
        const batchSkills = pageSkills.slice(batchStart, batchEnd)

        // 使用 DocumentFragment 批量添加卡片
        const fragment = document.createDocumentFragment()
        const tempDiv = document.createElement('div')
        tempDiv.innerHTML = batchSkills.map(renderSkillCard).join('')

        while (tempDiv.firstChild) {
          fragment.appendChild(tempDiv.firstChild)
        }

        grid.appendChild(fragment)

        // 为新添加的卡片绑定事件
        const newCards = grid.querySelectorAll('.skillhub-card:not([data-bound])')
        newCards.forEach(card => {
          card.dataset.bound = 'true'
          card.addEventListener('click', () => {
            const skillId = card.dataset.skillId
            const skill = allSkills.find(s => s.id === skillId)
            if (skill) showSkillDetail(skill, allSkills)
          })
        })
      })
    }

    // 更新分页按钮状态
    scheduleRender(() => {
      const pagination = page.querySelector('#pagination')
      if (skills.length > end) {
        pagination.style.display = 'flex'
      } else {
        pagination.style.display = 'none'
      }
    })
  }
  
  function filterAndSort() {
    let filtered = [...allSkills]
    
    if (currentCategory !== 'all') {
      filtered = filtered.filter(skill => 
        skill.categories && skill.categories.includes(currentCategory)
      )
    }
    
    const query = searchInput.value.toLowerCase().trim()
    if (query) {
      filtered = filtered.filter(skill => 
        (skill.displayName || skill.name).toLowerCase().includes(query) ||
        (skill.description || skill.summary || '').toLowerCase().includes(query) ||
        skill.id.toLowerCase().includes(query) ||
        (skill.tags || []).some(tag => tag.toLowerCase().includes(query))
      )
    }
    
    const sortBy = sortSelect.value
    switch (sortBy) {
      case 'downloads':
        filtered.sort((a, b) => (b.downloads || 0) - (a.downloads || 0))
        break
      case 'stars':
        filtered.sort((a, b) => (b.stars || 0) - (a.stars || 0))
        break
      case 'installs':
        filtered.sort((a, b) => (b.installs || 0) - (a.installs || 0))
        break
      case 'score':
        filtered.sort((a, b) => (b.score || 0) - (a.score || 0))
        break
      default:
        filtered.sort((a, b) => (b.score || 0) - (a.score || 0))
        break
    }
    
    filteredSkills = filtered
    // 搜索/排序/分类切换时需要重置，从第一页开始
    currentPage = 1
    renderSkills(filtered, true)
  }
  
  categoryEls.forEach(catEl => {
    catEl.addEventListener('click', () => {
      categoryEls.forEach(c => c.classList.remove('active'))
      catEl.classList.add('active')
      currentCategory = catEl.dataset.category
      filterAndSort()
    })
  })
  
  page.querySelector('#load-more')?.addEventListener('click', () => {
    currentPage++
    renderSkills(filteredSkills, false)
  })
  
  searchInput.addEventListener('input', debounce(filterAndSort, 300))
  sortSelect.addEventListener('change', filterAndSort)
  
  return page
}

function debounce(fn, delay) {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), delay)
  }
}
