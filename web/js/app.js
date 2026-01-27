const API_BASE = '';

let currentSearchMode = 'fts';
let currentResults = [];
let currentUnit = null;
let tagSummary = [];
let suggestionTimer = null;
let suggestionAbortController = null;
let suggestionItems = [];
let activeSuggestionIndex = -1;
let pendingShortcut = null; // For two-key shortcuts like G+R

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(value);
}

function getUnitFromResult(result) {
  return result.unit || result;
}

function getResultScore(result) {
  return result.combinedScore || result.score || 0;
}

document.addEventListener('DOMContentLoaded', () => {
  loadStats();
  loadCategories();
  loadTagSummary();
  setupEventListeners();
  loadConversations();
  loadAdminDashboard();
  loadWordCloud();
  applyHashState();
  initTheme();
  setupKeyboardShortcuts();
});

function setupEventListeners() {
  const searchInput = document.getElementById('searchInput');
  const suggestionsEl = document.getElementById('searchSuggestions');

  document.getElementById('searchBtn').addEventListener('click', performSearch);
  searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });
  searchInput.addEventListener('input', onSearchInputChange);
  searchInput.addEventListener('keydown', onSearchInputKeydown);

  document.addEventListener('click', (e) => {
    if (!suggestionsEl.contains(e.target) && e.target !== searchInput) {
      hideSuggestions();
    }
  });
  window.addEventListener('hashchange', applyHashState);

  document.querySelectorAll('input[name="searchMode"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      currentSearchMode = e.target.value;
      document.getElementById('hybridOptions').style.display =
        currentSearchMode === 'hybrid' ? 'flex' : 'none';
    });
  });

  document.getElementById('ftsWeight').addEventListener('input', (e) => {
    document.getElementById('ftsWeightValue').textContent = e.target.value;
  });
  document.getElementById('semanticWeight').addEventListener('input', (e) => {
    document.getElementById('semanticWeightValue').textContent = e.target.value;
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.target.dataset.tab;
      switchTab(tab);
    });
  });

  document.getElementById('loadGraphBtn').addEventListener('click', loadGraph);
  ['graphLimit', 'graphType', 'graphCategory', 'graphHops'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', loadGraphIfVisible);
  });
  const graphFocusId = document.getElementById('graphFocusId');
  if (graphFocusId) {
    graphFocusId.addEventListener('change', loadGraphIfVisible);
    graphFocusId.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') loadGraphIfVisible();
    });
  }
  document.getElementById('clearFilters').addEventListener('click', resetFilters);

  document.getElementById('filterType').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filterCategory').addEventListener('change', applyFiltersAndRender);
  document.getElementById('filterTag').addEventListener('input', applyFiltersAndRender);
  document.getElementById('filterScore').addEventListener('input', applyFiltersAndRender);
  document.getElementById('filterSort').addEventListener('change', applyFiltersAndRender);

  document.getElementById('tagSearchInput').addEventListener('input', (e) => {
    renderTagCards(tagSummary, e.target.value);
  });
  document.getElementById('refreshTagsBtn').addEventListener('click', loadTagSummary);

  document.querySelector('.close').addEventListener('click', closeModal);
  window.addEventListener('click', (e) => {
    if (e.target.id === 'unitModal') closeModal();
  });

  document.getElementById('searchResults').addEventListener('click', (e) => {
    const target = e.target;
    if (target.classList.contains('tag') && target.dataset.tag) {
      e.stopPropagation();
      document.getElementById('filterTag').value = target.dataset.tag;
      applyFiltersAndRender();
    }
  });

  // Export button
  const exportBtn = document.getElementById('exportBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', handleExport);
  }

  // Word cloud controls
  const refreshWordcloudBtn = document.getElementById('refreshWordcloudBtn');
  if (refreshWordcloudBtn) {
    refreshWordcloudBtn.addEventListener('click', loadWordCloud);
  }

  const wordcloudSource = document.getElementById('wordcloudSource');
  if (wordcloudSource) {
    wordcloudSource.addEventListener('change', loadWordCloud);
  }

  const wordcloudLimit = document.getElementById('wordcloudLimit');
  if (wordcloudLimit) {
    wordcloudLimit.addEventListener('change', loadWordCloud);
  }
}

async function loadStats() {
  try {
    const response = await fetch(`${API_BASE}/api/stats`);
    const stats = await response.json();

    const statsEl = document.getElementById('stats');
    statsEl.innerHTML = `
      <div class="stat-card">
        <span class="stat-label">Units</span>
        <span class="stat-value">${formatNumber(stats.totalUnits.count)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Conversations</span>
        <span class="stat-value">${formatNumber(stats.totalConversations.count)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Documents</span>
        <span class="stat-value">${formatNumber(stats.totalDocuments.count)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Tags</span>
        <span class="stat-value">${formatNumber(stats.totalTags.count)}</span>
      </div>
    `;

    if (Array.isArray(stats.unitsByType)) {
      const typeOptions = stats.unitsByType.map(item => item.type).filter(Boolean);
      updateSelectOptions('filterType', typeOptions, 'All types');
      updateSelectOptions('graphType', typeOptions, 'All types', '');
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function updateSelectOptions(selectId, options, placeholder, placeholderValue = 'all') {
  const select = document.getElementById(selectId);
  const currentValue = select.value;
  const uniqueOptions = Array.from(new Set(options)).sort();
  select.innerHTML = `<option value="${escapeHtml(placeholderValue)}">${placeholder}</option>` + uniqueOptions
    .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');
  if (uniqueOptions.includes(currentValue)) {
    select.value = currentValue;
  } else {
    select.value = placeholderValue;
  }
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE}/api/categories`);
    if (!response.ok) return;
    const data = await response.json();
    const categories = (data.categories || []).map(item => item.category).filter(Boolean);
    updateSelectOptions('filterCategory', categories, 'All categories');
    updateSelectOptions('graphCategory', categories, 'All categories', '');
  } catch (error) {
    console.error('Failed to load categories:', error);
  }
}

function loadGraphIfVisible() {
  const graphTab = document.getElementById('graph-tab');
  if (graphTab?.classList.contains('active')) {
    loadGraph();
  }
}

function onSearchInputChange(e) {
  const value = e.target.value.trim();

  if (suggestionTimer) clearTimeout(suggestionTimer);
  activeSuggestionIndex = -1;

  if (value.length < 1) {
    hideSuggestions();
    return;
  }

  suggestionTimer = setTimeout(() => {
    fetchSearchSuggestions(value);
  }, 120);
}

function onSearchInputKeydown(e) {
  if (suggestionItems.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const nextIndex = Math.min(activeSuggestionIndex + 1, suggestionItems.length - 1);
    setActiveSuggestion(nextIndex);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const nextIndex = Math.max(activeSuggestionIndex - 1, 0);
    setActiveSuggestion(nextIndex);
  } else if (e.key === 'Enter' && activeSuggestionIndex >= 0) {
    e.preventDefault();
    suggestionItems[activeSuggestionIndex].click();
  } else if (e.key === 'Escape') {
    hideSuggestions();
  }
}

async function fetchSearchSuggestions(prefix) {
  const suggestionsEl = document.getElementById('searchSuggestions');

  if (suggestionAbortController) {
    suggestionAbortController.abort();
  }
  suggestionAbortController = new AbortController();

  try {
    const url = `${API_BASE}/api/search/suggestions?q=${encodeURIComponent(prefix)}&limit=8`;
    const response = await fetch(url, { signal: suggestionAbortController.signal });
    if (!response.ok) {
      hideSuggestions();
      return;
    }
    const data = await response.json();
    renderSearchSuggestions(data.suggestions || []);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Failed to load suggestions:', error);
      hideSuggestions();
    }
  } finally {
    suggestionAbortController = null;
    if (!suggestionsEl.innerHTML.trim()) {
      hideSuggestions();
    }
  }
}

function renderSearchSuggestions(items) {
  const suggestionsEl = document.getElementById('searchSuggestions');
  if (!items || items.length === 0) {
    hideSuggestions();
    return;
  }

  suggestionsEl.innerHTML = items.map(item => {
    const encoded = encodeURIComponent(item);
    return `
      <button
        type="button"
        class="search-suggestion-item"
        data-value="${encoded}"
      >
        ${escapeHtml(item)}
      </button>
    `;
  }).join('');

  suggestionItems = Array.from(suggestionsEl.querySelectorAll('.search-suggestion-item'));
  suggestionItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const value = decodeURIComponent(btn.dataset.value);
      document.getElementById('searchInput').value = value;
      hideSuggestions();
      performSearch();
    });
  });

  activeSuggestionIndex = -1;
  suggestionsEl.classList.add('show');
}

function hideSuggestions() {
  const suggestionsEl = document.getElementById('searchSuggestions');
  suggestionsEl.classList.remove('show');
  suggestionsEl.innerHTML = '';
  suggestionItems = [];
  activeSuggestionIndex = -1;
}

function setActiveSuggestion(index) {
  activeSuggestionIndex = index;
  suggestionItems.forEach((item, i) => {
    item.classList.toggle('active', i === index);
  });
  const activeItem = suggestionItems[index];
  if (activeItem) {
    activeItem.scrollIntoView({ block: 'nearest' });
  }
}

function updateHashParam(key, value) {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  if (value === null || value === undefined || value === '') {
    params.delete(key);
  } else {
    params.set(key, value);
  }

  const nextHash = params.toString();
  const baseUrl = `${window.location.pathname}${window.location.search}`;
  const nextUrl = nextHash ? `${baseUrl}#${nextHash}` : baseUrl;
  window.history.replaceState(null, '', nextUrl);
}

function applyHashState() {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const tab = params.get('tab');
  const unitId = params.get('unit');

  if (tab) {
    switchTab(tab, { updateHash: false });
  }

  if (unitId && (!currentUnit || currentUnit.id !== unitId)) {
    showUnitDetail(unitId, { updateHash: false });
  }
}

async function loadTagSummary() {
  try {
    const response = await fetch(`${API_BASE}/api/tags/summary?limit=200`);
    const data = await response.json();
    tagSummary = data.tags || [];
    renderTagCards(tagSummary, document.getElementById('tagSearchInput').value);
    const tagOptions = tagSummary.map(tag => tag.name || tag.value || tag);
    updateDatalistOptions('tagOptions', tagOptions);
    loadAdminDashboard();
  } catch (error) {
    console.error('Failed to load tag summary:', error);
  }
}

function updateDatalistOptions(datalistId, options) {
  const datalist = document.getElementById(datalistId);
  datalist.innerHTML = options
    .filter(Boolean)
    .sort()
    .map(tag => `<option value="${escapeHtml(tag)}"></option>`)
    .join('');
}

function renderTagCards(tags, query = '') {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = tags.filter(tag => {
    const name = (tag.name || tag.value || tag).toString();
    return normalizedQuery ? name.toLowerCase().includes(normalizedQuery) : true;
  });

  const html = filtered.map(tag => {
    const name = tag.name || tag.value || tag;
    const count = tag.count || 0;
    return `
      <div class="tag-card" onclick="searchByTag('${escapeHtml(name)}')">
        <div class="tag-name">${escapeHtml(name)}</div>
        <div class="tag-count">${formatNumber(count)} units</div>
      </div>
    `;
  }).join('');

  document.getElementById('tagsContainer').innerHTML = html || '<div class="empty-state">No tags found</div>';
}

async function loadAdminDashboard() {
  try {
    const [statsResponse, healthResponse] = await Promise.all([
      fetch(`${API_BASE}/api/stats`),
      fetch(`${API_BASE}/api/health`)
    ]);

    const stats = statsResponse.ok ? await statsResponse.json() : null;
    const health = healthResponse.ok ? await healthResponse.json() : null;
    const topTags = tagSummary.slice(0, 8);

    const typeStats = stats?.unitsByType || [];
    const typeList = typeStats.map(type => `${type.type}: ${formatNumber(type.count)}`).join('<br>') || 'No type data';
    const tagList = topTags.map(tag => `${tag.name || tag.value || tag}: ${formatNumber(tag.count || 0)}`).join('<br>') || 'No tags yet';

    document.getElementById('adminDashboard').innerHTML = `
      <div class="admin-grid">
        <div class="admin-card">
          <h3>System Health</h3>
          <div class="admin-list">
            <div>Status: ${health?.status || 'unknown'}</div>
            <div>Semantic Ready: ${health?.servicesReady ? 'Yes' : 'No'}</div>
            <div>OpenAI Key: ${health?.hasOpenAI ? 'Configured' : 'Missing'}</div>
            <div>Anthropic Key: ${health?.hasAnthropic ? 'Configured' : 'Missing'}</div>
          </div>
        </div>
        <div class="admin-card">
          <h3>Dataset</h3>
          <div class="admin-list">
            <div>Units: ${formatNumber(stats?.totalUnits?.count || 0)}</div>
            <div>Conversations: ${formatNumber(stats?.totalConversations?.count || 0)}</div>
            <div>Documents: ${formatNumber(stats?.totalDocuments?.count || 0)}</div>
            <div>Tags: ${formatNumber(stats?.totalTags?.count || 0)}</div>
          </div>
        </div>
        <div class="admin-card">
          <h3>Units by Type</h3>
          <div class="admin-list">${typeList}</div>
        </div>
        <div class="admin-card">
          <h3>Top Tags</h3>
          <div class="admin-list">${tagList}</div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Failed to load admin dashboard:', error);
  }
}

async function performSearch() {
  hideSuggestions();
  switchTab('results');
  const query = document.getElementById('searchInput').value.trim();
  const resultsContainer = document.getElementById('searchResults');
  const limit = document.getElementById('searchLimit').value;

  if (!query) {
    resultsContainer.innerHTML = '<div class="empty-state"><h3>Type a search query</h3><p>Try keywords like "embeddings" or "tags".</p></div>';
    updateResultsSummary([], 0);
    return;
  }

  resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

  try {
    let url;
    if (currentSearchMode === 'fts') {
      url = `${API_BASE}/api/search/fts?q=${encodeURIComponent(query)}&limit=${limit}`;
    } else if (currentSearchMode === 'semantic') {
      url = `${API_BASE}/api/search/semantic?q=${encodeURIComponent(query)}&limit=${limit}`;
    } else {
      const ftsWeight = document.getElementById('ftsWeight').value;
      const semanticWeight = document.getElementById('semanticWeight').value;
      url = `${API_BASE}/api/search/hybrid?q=${encodeURIComponent(query)}&ftsWeight=${ftsWeight}&semanticWeight=${semanticWeight}&limit=${limit}`;
    }

    const response = await fetch(url);
    const data = await response.json();

    currentResults = data.results || [];
    applyFiltersAndRender();
  } catch (error) {
    console.error('Search failed:', error);
    resultsContainer.innerHTML = `<div class="empty-state"><h3>Search failed</h3><p>${escapeHtml(error.message)}</p></div>`;
    updateResultsSummary([], 0);
  }
}

function resetFilters() {
  document.getElementById('filterType').value = 'all';
  document.getElementById('filterCategory').value = 'all';
  document.getElementById('filterTag').value = '';
  document.getElementById('filterScore').value = '';
  document.getElementById('filterSort').value = 'relevance';
  applyFiltersAndRender();
}

function applyFiltersAndRender() {
  const filtered = applyFilters(currentResults);
  renderResults(filtered);
  updateResultsSummary(filtered, currentResults.length);
}

function applyFilters(results) {
  const typeFilter = document.getElementById('filterType').value;
  const categoryFilter = document.getElementById('filterCategory').value;
  const tagFilter = document.getElementById('filterTag').value.trim();
  const scoreFilter = parseFloat(document.getElementById('filterScore').value);
  const sortBy = document.getElementById('filterSort').value;

  let filtered = results.filter(result => {
    const unit = getUnitFromResult(result);
    if (!unit) return false;
    if (typeFilter !== 'all' && unit.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && unit.category !== categoryFilter) return false;
    if (tagFilter && !(unit.tags || []).includes(tagFilter)) return false;
    if (!Number.isNaN(scoreFilter) && scoreFilter > 0) {
      const score = getResultScore(result);
      if (score < scoreFilter) return false;
    }
    return true;
  });

  if (sortBy === 'recent') {
    filtered = filtered.sort((a, b) => {
      const dateA = new Date(getUnitFromResult(a).timestamp || 0).getTime();
      const dateB = new Date(getUnitFromResult(b).timestamp || 0).getTime();
      return dateB - dateA;
    });
  } else if (sortBy === 'title') {
    filtered = filtered.sort((a, b) => {
      const titleA = (getUnitFromResult(a).title || '').toLowerCase();
      const titleB = (getUnitFromResult(b).title || '').toLowerCase();
      return titleA.localeCompare(titleB);
    });
  } else {
    filtered = filtered.sort((a, b) => getResultScore(b) - getResultScore(a));
  }

  return filtered;
}

function updateResultsSummary(filteredResults, totalResults) {
  const summary = document.getElementById('resultsSummary');
  if (!summary) return;
  if (!totalResults) {
    summary.textContent = '';
    return;
  }

  const tagFilter = document.getElementById('filterTag').value.trim();
  const typeFilter = document.getElementById('filterType').value;
  const categoryFilter = document.getElementById('filterCategory').value;
  const scoreFilter = document.getElementById('filterScore').value;

  const filters = [];
  if (typeFilter !== 'all') filters.push(`type: ${typeFilter}`);
  if (categoryFilter !== 'all') filters.push(`category: ${categoryFilter}`);
  if (tagFilter) filters.push(`tag: ${tagFilter}`);
  if (scoreFilter) filters.push(`score ≥ ${scoreFilter}`);

  summary.innerHTML = `
    <span>Showing ${formatNumber(filteredResults.length)} of ${formatNumber(totalResults)} results</span>
    <span>${filters.length ? `Filters: ${filters.join(', ')}` : 'No filters applied'}</span>
  `;
}

function renderResults(results) {
  const container = document.getElementById('searchResults');

  if (!results || results.length === 0) {
    container.innerHTML = '<div class="empty-state"><h3>No results found</h3><p>Try a different search query.</p></div>';
    return;
  }

  const html = results.map((result, index) => {
    const unit = getUnitFromResult(result);
    const score = getResultScore(result);
    const tags = Array.isArray(unit.tags) ? unit.tags : [];

    return `
      <div class="result-card" style="--delay: ${index * 40}ms" onclick="showUnitDetail('${escapeHtml(unit.id)}')">
        <div class="result-header">
          <div class="result-title">${escapeHtml(unit.title)}</div>
          <div class="result-type">${escapeHtml(unit.type)}</div>
        </div>
        <div class="result-content">
          ${escapeHtml(unit.content.slice(0, 200))}${unit.content.length > 200 ? '...' : ''}
        </div>
        <div class="result-meta">
          <span>Category: ${escapeHtml(unit.category)}</span>
          ${score ? `<span>Score: ${(score * 100).toFixed(1)}%</span>` : ''}
          <div class="result-tags">
            ${tags.slice(0, 5).map(tag => `<span class="tag clickable" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)}</span>`).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

async function showUnitDetail(unitId, options = {}) {
  try {
    const { updateHash = true } = options;
    if (updateHash) {
      updateHashParam('unit', unitId);
    }
    const response = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitId)}`);
    const unit = await response.json();
    currentUnit = unit;

    const html = `
      <h2>${escapeHtml(unit.title)}</h2>
      <div class="detail-section">
        <div class="detail-label">Type</div>
        <div>${escapeHtml(unit.type)}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Category</div>
        <div>${escapeHtml(unit.category)}</div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Content</div>
        <div style="white-space: pre-wrap;">${escapeHtml(unit.content)}</div>
      </div>
      ${unit.context ? `
      <div class="detail-section">
        <div class="detail-label">Context</div>
        <div>${escapeHtml(unit.context)}</div>
      </div>
      ` : ''}
      <div class="detail-section">
        <div class="detail-label">Tags</div>
        <div class="result-tags">
          ${(unit.tags || []).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
        </div>
      </div>
      <div class="detail-section">
        <div class="detail-label">Manage Tags</div>
        <div class="tag-manager">
          <div class="tag-input">
            <input id="unitTagInput" type="text" placeholder="Add a tag">
            <button id="addUnitTagBtn" class="btn-secondary">Add tag</button>
          </div>
          <div id="unitTagList" class="tag-list"></div>
        </div>
      </div>
      ${(unit.keywords || []).length > 0 ? `
      <div class="detail-section">
        <div class="detail-label">Keywords</div>
        <div>${escapeHtml(unit.keywords.join(', '))}</div>
      </div>
      ` : ''}
      <div class="detail-section">
        <div class="detail-label">Timestamp</div>
        <div>${escapeHtml(new Date(unit.timestamp).toLocaleString())}</div>
      </div>
    `;

    document.getElementById('unitDetail').innerHTML = html;
    document.getElementById('unitModal').classList.add('show');
    setupTagManager(unit);
  } catch (error) {
    console.error('Failed to load unit:', error);
  }
}

function setupTagManager(unit) {
  const tagInput = document.getElementById('unitTagInput');
  const addButton = document.getElementById('addUnitTagBtn');
  const tagList = document.getElementById('unitTagList');

  if (!tagInput || !addButton || !tagList) return;

  const render = () => {
    tagList.innerHTML = (unit.tags || []).map(tag => `
      <span class="tag-pill">
        ${escapeHtml(tag)}
        <button type="button" data-tag="${escapeHtml(tag)}">×</button>
      </span>
    `).join('');
  };

  render();

  addButton.onclick = async () => {
    const newTag = tagInput.value.trim();
    if (!newTag) return;
    const updated = await addTagToUnit(unit.id, newTag);
    if (updated) {
      unit.tags = updated;
      tagInput.value = '';
      render();
      syncUnitTags(unit.id, updated);
      loadTagSummary();
    }
  };

  tagList.onclick = async (event) => {
    const target = event.target;
    if (!target.dataset.tag) return;
    const tagToRemove = target.dataset.tag;
    const updated = await removeTagFromUnit(unit.id, tagToRemove);
    if (updated) {
      unit.tags = updated;
      render();
      syncUnitTags(unit.id, updated);
      loadTagSummary();
    }
  };
}

async function addTagToUnit(unitId, tag) {
  try {
    const response = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitId)}/tags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [tag] })
    });
    if (!response.ok) throw new Error('Failed to add tag');
    const data = await response.json();
    return data.tags || [];
  } catch (error) {
    console.error('Failed to add tag:', error);
    return null;
  }
}

async function removeTagFromUnit(unitId, tag) {
  try {
    const response = await fetch(`${API_BASE}/api/units/${encodeURIComponent(unitId)}/tags/${encodeURIComponent(tag)}`, {
      method: 'DELETE'
    });
    if (!response.ok) throw new Error('Failed to remove tag');
    const data = await response.json();
    return data.tags || [];
  } catch (error) {
    console.error('Failed to remove tag:', error);
    return null;
  }
}

function syncUnitTags(unitId, tags) {
  currentResults = currentResults.map(result => {
    const unit = getUnitFromResult(result);
    if (unit.id !== unitId) return result;
    const updatedUnit = { ...unit, tags };
    if (result.unit) {
      return { ...result, unit: updatedUnit };
    }
    return updatedUnit;
  });
  applyFiltersAndRender();
}

function closeModal() {
  document.getElementById('unitModal').classList.remove('show');
  currentUnit = null;
  updateHashParam('unit', null);
}

async function searchByTag(tag) {
  try {
    const response = await fetch(`${API_BASE}/api/tags/${encodeURIComponent(tag)}/units`);
    const data = await response.json();

    currentResults = data.units || [];
    document.getElementById('filterTag').value = tag;
    switchTab('results');
    applyFiltersAndRender();
  } catch (error) {
    console.error('Failed to search by tag:', error);
  }
}

async function loadConversations() {
  try {
    const response = await fetch(`${API_BASE}/api/conversations`);
    const data = await response.json();

    const html = (data.conversations || []).map(conv => `
      <div class="conversation-card">
        <div class="conversation-title">${escapeHtml(conv.title)}</div>
        <div class="conversation-date">
          ${escapeHtml(new Date(conv.created).toLocaleDateString())}
        </div>
      </div>
    `).join('');

    document.getElementById('conversationsContainer').innerHTML = html || '<div class="empty-state">No conversations found</div>';
  } catch (error) {
    console.error('Failed to load conversations:', error);
  }
}

async function loadGraph() {
  const container = document.getElementById('graphContainer');
  const limit = document.getElementById('graphLimit').value;
  const type = document.getElementById('graphType').value;
  const category = document.getElementById('graphCategory').value;
  const focusId = document.getElementById('graphFocusId').value.trim();
  const hops = document.getElementById('graphHops').value;

  container.innerHTML = '<div class="loading">Loading graph...</div>';

  try {
    const params = new URLSearchParams();
    params.set('limit', limit);
    if (type) params.set('type', type);
    if (category) params.set('category', category);
    if (focusId) params.set('focusId', focusId);
    if (hops) params.set('hops', hops);

    const response = await fetch(`${API_BASE}/api/graph?${params.toString()}`);
    const data = await response.json();

    if (!data.nodes || data.nodes.length === 0) {
      container.innerHTML = '<div class="empty-state">No graph data available</div>';
      return;
    }

    renderGraph(data);
  } catch (error) {
    console.error('Failed to load graph:', error);
    container.innerHTML = '<div class="empty-state">Failed to load graph</div>';
  }
}

function renderGraph(data) {
  const container = document.getElementById('graphContainer');
  container.innerHTML = '';

  const width = container.clientWidth;
  const height = container.clientHeight;

  const svg = d3.select('#graphContainer')
    .append('svg')
    .attr('width', width)
    .attr('height', height);

  const simulation = d3.forceSimulation(data.nodes)
    .force('link', d3.forceLink(data.edges).id(d => d.id).distance(100))
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2));

  const link = svg.append('g')
    .selectAll('line')
    .data(data.edges)
    .join('line')
    .attr('stroke', '#264653')
    .attr('stroke-width', 1.6)
    .attr('opacity', 0.5);

  const node = svg.append('g')
    .selectAll('circle')
    .data(data.nodes)
    .join('circle')
    .attr('r', 8)
    .attr('fill', d => getNodeColor(d.type))
    .call(drag(simulation))
    .on('click', (event, d) => showUnitDetail(d.id));

  node.append('title')
    .text(d => d.label);

  const label = svg.append('g')
    .selectAll('text')
    .data(data.nodes)
    .join('text')
    .text(d => d.label.slice(0, 30))
    .attr('font-size', 10)
    .attr('fill', '#3a4a5a')
    .attr('pointer-events', 'none');

  simulation.on('tick', () => {
    link
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    node
      .attr('cx', d => d.x)
      .attr('cy', d => d.y);

    label
      .attr('x', d => d.x + 12)
      .attr('y', d => d.y + 4);
  });
}

function drag(simulation) {
  function dragstarted(event) {
    if (!event.active) simulation.alphaTarget(0.3).restart();
    event.subject.fx = event.subject.x;
    event.subject.fy = event.subject.y;
  }

  function dragged(event) {
    event.subject.fx = event.x;
    event.subject.fy = event.y;
  }

  function dragended(event) {
    if (!event.active) simulation.alphaTarget(0);
    event.subject.fx = null;
    event.subject.fy = null;
  }

  return d3.drag()
    .on('start', dragstarted)
    .on('drag', dragged)
    .on('end', dragended);
}

function getNodeColor(type) {
  const colors = {
    insight: '#2a9d8f',
    code: '#e9c46a',
    question: '#f4a261',
    reference: '#3a86ff',
    decision: '#e76f51',
  };
  return colors[type] || '#264653';
}

function switchTab(tabName, options = {}) {
  const { updateHash = true } = options;
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });

  if (updateHash) {
    updateHashParam('tab', tabName);
  }
  if (tabName === 'graph') {
    loadGraphIfVisible();
  }
}

// ============================================
// THEME MANAGEMENT
// ============================================

function initTheme() {
  const savedTheme = localStorage.getItem('kb-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (prefersDark) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }

  updateThemeIcon();

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('kb-theme')) {
      document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      updateThemeIcon();
    }
  });

  // Theme toggle button
  const themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', toggleTheme);
  }

  // Shortcuts button
  const shortcutsBtn = document.getElementById('shortcutsBtn');
  if (shortcutsBtn) {
    shortcutsBtn.addEventListener('click', showShortcutsModal);
  }
}

function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('kb-theme', newTheme);
  updateThemeIcon();

  showToast(newTheme === 'dark' ? 'Dark mode enabled' : 'Light mode enabled', 'info');
}

function updateThemeIcon() {
  const themeIcon = document.getElementById('themeIcon');
  if (themeIcon) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeIcon.textContent = isDark ? '☀️' : '🌙';
  }
}

// ============================================
// KEYBOARD SHORTCUTS
// ============================================

function setupKeyboardShortcuts() {
  document.addEventListener('keydown', handleKeyboardShortcut);

  // Close shortcuts modal
  const closeBtn = document.querySelector('.close-shortcuts');
  if (closeBtn) {
    closeBtn.addEventListener('click', hideShortcutsModal);
  }

  // Click outside to close
  const shortcutsModal = document.getElementById('shortcutsModal');
  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) {
        hideShortcutsModal();
      }
    });
  }
}

function handleKeyboardShortcut(e) {
  const target = e.target;
  const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
  const key = e.key.toLowerCase();

  // Always allow Escape
  if (key === 'escape') {
    if (document.getElementById('shortcutsModal').classList.contains('show')) {
      hideShortcutsModal();
      return;
    }
    if (document.getElementById('unitModal').classList.contains('show')) {
      closeModal();
      return;
    }
    hideSuggestions();
    pendingShortcut = null;
    return;
  }

  // Ctrl/Cmd + K - Focus search
  if ((e.ctrlKey || e.metaKey) && key === 'k') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
    return;
  }

  // Don't process other shortcuts when in input fields
  if (isInput) return;

  // Handle two-key shortcuts (G + something)
  if (pendingShortcut === 'g') {
    pendingShortcut = null;
    switch (key) {
      case 'r':
        switchTab('results');
        showToast('Switched to Results', 'info');
        return;
      case 'g':
        switchTab('graph');
        showToast('Switched to Graph', 'info');
        return;
      case 't':
        switchTab('tags');
        showToast('Switched to Tags', 'info');
        return;
      case 'c':
        switchTab('conversations');
        showToast('Switched to Conversations', 'info');
        return;
      case 'a':
        switchTab('admin');
        showToast('Switched to Admin', 'info');
        return;
    }
  }

  // Single key shortcuts
  switch (key) {
    case '/':
      e.preventDefault();
      document.getElementById('searchInput').focus();
      break;
    case 't':
      toggleTheme();
      break;
    case '?':
      showShortcutsModal();
      break;
    case 'g':
      pendingShortcut = 'g';
      // Clear pending shortcut after 1 second
      setTimeout(() => {
        pendingShortcut = null;
      }, 1000);
      break;
  }
}

function showShortcutsModal() {
  document.getElementById('shortcutsModal').classList.add('show');
}

function hideShortcutsModal() {
  document.getElementById('shortcutsModal').classList.remove('show');
}

// ============================================
// TOAST NOTIFICATIONS
// ============================================

function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, duration);
}

// ============================================
// EXPORT FUNCTIONALITY
// ============================================

async function exportData(format, units = null) {
  try {
    const dataToExport = units || currentResults.map(r => getUnitFromResult(r));

    if (dataToExport.length === 0) {
      showToast('No data to export. Perform a search first.', 'error');
      return;
    }

    const response = await fetch(`${API_BASE}/api/export/${format}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ units: dataToExport })
    });

    if (!response.ok) {
      throw new Error('Export failed');
    }

    // Get filename from Content-Disposition header
    const disposition = response.headers.get('Content-Disposition');
    let filename = `export.${format}`;
    if (disposition) {
      const match = disposition.match(/filename=(.+)/);
      if (match) filename = match[1];
    }

    // Download the file
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();

    showToast(`Exported ${dataToExport.length} units to ${format.toUpperCase()}`, 'success');
  } catch (error) {
    console.error('Export failed:', error);
    showToast('Export failed: ' + error.message, 'error');
  }
}

async function handleExport() {
  const source = document.getElementById('exportSource').value;
  const format = document.getElementById('exportFormat').value;
  const statusEl = document.getElementById('exportStatus');

  statusEl.className = 'export-status show';
  statusEl.textContent = 'Preparing export...';

  try {
    let units;

    if (source === 'results') {
      units = currentResults.map(r => getUnitFromResult(r));
      if (units.length === 0) {
        statusEl.className = 'export-status show error';
        statusEl.textContent = 'No search results to export. Perform a search first.';
        return;
      }
    } else {
      // Fetch all units from API
      statusEl.textContent = 'Fetching units...';
      const response = await fetch(`${API_BASE}/api/units?limit=1000`);
      if (!response.ok) throw new Error('Failed to fetch units');
      const data = await response.json();
      units = data.units || data.data || [];
    }

    statusEl.textContent = `Exporting ${units.length} units to ${format.toUpperCase()}...`;

    await exportData(format, units);

    statusEl.className = 'export-status show success';
    statusEl.textContent = `Successfully exported ${units.length} units to ${format.toUpperCase()}`;

    setTimeout(() => {
      statusEl.className = 'export-status';
    }, 5000);
  } catch (error) {
    console.error('Export failed:', error);
    statusEl.className = 'export-status show error';
    statusEl.textContent = 'Export failed: ' + error.message;
  }
}

// ============================================
// WORD CLOUD
// ============================================

async function loadWordCloud() {
  const container = document.getElementById('wordcloud');
  if (!container) return;

  const source = document.getElementById('wordcloudSource')?.value || 'both';
  const limit = document.getElementById('wordcloudLimit')?.value || '100';

  container.innerHTML = '<div class="loading">Loading word cloud...</div>';

  try {
    const response = await fetch(`${API_BASE}/api/wordcloud?source=${source}&limit=${limit}`);
    if (!response.ok) throw new Error('Failed to load word cloud');

    const data = await response.json();
    renderWordCloud(data.data || []);
  } catch (error) {
    console.error('Word cloud error:', error);
    container.innerHTML = '<div class="empty-state">Failed to load word cloud</div>';
  }
}

function renderWordCloud(words) {
  const container = document.getElementById('wordcloud');
  if (!container || !words.length) {
    container.innerHTML = '<div class="empty-state">No words to display</div>';
    return;
  }

  // Calculate size bucket (1-8) based on normalizedValue
  const getSizeBucket = (normalizedValue) => {
    if (normalizedValue >= 90) return 8;
    if (normalizedValue >= 70) return 7;
    if (normalizedValue >= 50) return 6;
    if (normalizedValue >= 35) return 5;
    if (normalizedValue >= 20) return 4;
    if (normalizedValue >= 10) return 3;
    if (normalizedValue >= 5) return 2;
    return 1;
  };

  // Shuffle words for more interesting visual
  const shuffled = [...words].sort(() => Math.random() - 0.5);

  const html = shuffled.map(word => {
    const size = getSizeBucket(word.normalizedValue);
    const typeClass = word.type === 'tag' ? 'tag' : 'keyword';
    return `
      <span
        class="wordcloud-word ${typeClass}"
        data-size="${size}"
        data-type="${word.type}"
        title="${escapeHtml(word.text)}: ${word.value} occurrences"
        onclick="wordCloudClick('${escapeHtml(word.text)}', '${word.type}')"
      >
        ${escapeHtml(word.text)}
      </span>
    `;
  }).join('');

  container.innerHTML = html;
}

function wordCloudClick(word, type) {
  if (type === 'tag') {
    // Search by tag
    searchByTag(word);
  } else {
    // Search for keyword
    document.getElementById('searchInput').value = word;
    performSearch();
  }
  showToast(`Searching for "${word}"`, 'info');
}
