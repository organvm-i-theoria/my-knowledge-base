const API_BASE = '';

let currentSearchMode = 'fts';
let currentResults = [];
let currentUnit = null;
let tagSummary = [];

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
});

function setupEventListeners() {
  document.getElementById('searchBtn').addEventListener('click', performSearch);
  document.getElementById('searchInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') performSearch();
  });

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
    }
  } catch (error) {
    console.error('Failed to load stats:', error);
  }
}

function updateSelectOptions(selectId, options, placeholder) {
  const select = document.getElementById(selectId);
  const currentValue = select.value;
  const uniqueOptions = Array.from(new Set(options)).sort();
  select.innerHTML = `<option value="all">${placeholder}</option>` + uniqueOptions
    .map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`)
    .join('');
  if (uniqueOptions.includes(currentValue)) {
    select.value = currentValue;
  }
}

async function loadCategories() {
  try {
    const response = await fetch(`${API_BASE}/api/categories`);
    if (!response.ok) return;
    const data = await response.json();
    const categories = (data.categories || []).map(item => item.category).filter(Boolean);
    updateSelectOptions('filterCategory', categories, 'All categories');
  } catch (error) {
    console.error('Failed to load categories:', error);
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

async function showUnitDetail(unitId) {
  try {
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

  container.innerHTML = '<div class="loading">Loading graph...</div>';

  try {
    const response = await fetch(`${API_BASE}/api/graph?limit=${limit}`);
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

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `${tabName}-tab`);
  });
}
