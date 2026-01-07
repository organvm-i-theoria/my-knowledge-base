// API base URL
const API_BASE = '';

// State
let currentSearchMode = 'fts';
let currentResults = [];

// Utility: escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    setupEventListeners();
    loadTags();
    loadConversations();
});

// Setup event listeners
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

    document.querySelector('.close').addEventListener('click', closeModal);
    window.addEventListener('click', (e) => {
        if (e.target.id === 'unitModal') closeModal();
    });
}

// Load stats
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE}/api/stats`);
        const stats = await response.json();

        const statsEl = document.getElementById('stats');
        statsEl.textContent = `${stats.totalUnits.count} units • ${stats.totalConversations.count} conversations • ${stats.totalTags.count} tags`;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// Perform search
async function performSearch() {
    const query = document.getElementById('searchInput').value.trim();
    if (!query) return;

    const resultsContainer = document.getElementById('searchResults');
    resultsContainer.innerHTML = '<div class="loading">Searching...</div>';

    try {
        let url;
        if (currentSearchMode === 'fts') {
            url = `${API_BASE}/api/search/fts?q=${encodeURIComponent(query)}`;
        } else if (currentSearchMode === 'semantic') {
            url = `${API_BASE}/api/search/semantic?q=${encodeURIComponent(query)}`;
        } else {
            const ftsWeight = document.getElementById('ftsWeight').value;
            const semanticWeight = document.getElementById('semanticWeight').value;
            url = `${API_BASE}/api/search/hybrid?q=${encodeURIComponent(query)}&ftsWeight=${ftsWeight}&semanticWeight=${semanticWeight}`;
        }

        const response = await fetch(url);
        const data = await response.json();

        currentResults = data.results;
        renderResults(currentResults);
    } catch (error) {
        console.error('Search failed:', error);
        resultsContainer.innerHTML = `<div class="empty-state"><h3>Search failed</h3><p>Error: ${escapeHtml(error.message)}</p></div>`;
    }
}

// Render search results (all content is escaped)
function renderResults(results) {
    const container = document.getElementById('searchResults');

    if (results.length === 0) {
        container.innerHTML = '<div class="empty-state"><h3>No results found</h3><p>Try a different search query</p></div>';
        return;
    }

    const html = results.map(result => {
        const unit = result.unit || result;
        const score = result.combinedScore || result.score || 0;

        return `
            <div class="result-card" onclick="showUnitDetail('${escapeHtml(unit.id)}')">
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
                        ${unit.tags.slice(0, 5).map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

// Show unit detail modal (all content is escaped)
async function showUnitDetail(unitId) {
    try {
        const response = await fetch(`${API_BASE}/api/units/${escapeHtml(unitId)}`);
        const unit = await response.json();

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
                    ${unit.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
                </div>
            </div>
            ${unit.keywords.length > 0 ? `
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
    } catch (error) {
        console.error('Failed to load unit:', error);
    }
}

function closeModal() {
    document.getElementById('unitModal').classList.remove('show');
}

// Load tags (all content is escaped)
async function loadTags() {
    try {
        const response = await fetch(`${API_BASE}/api/tags`);
        const data = await response.json();

        const html = data.tags.map(tag => `
            <div class="tag-card" onclick="searchByTag('${escapeHtml(tag)}')">
                <div class="tag-name">${escapeHtml(tag)}</div>
            </div>
        `).join('');

        document.getElementById('tagsContainer').innerHTML = html || '<div class="empty-state">No tags found</div>';
    } catch (error) {
        console.error('Failed to load tags:', error);
    }
}

async function searchByTag(tag) {
    try {
        const response = await fetch(`${API_BASE}/api/tags/${encodeURIComponent(tag)}/units`);
        const data = await response.json();

        currentResults = data.units;
        switchTab('results');
        renderResults(currentResults);
    } catch (error) {
        console.error('Failed to search by tag:', error);
    }
}

// Load conversations (all content is escaped)
async function loadConversations() {
    try {
        const response = await fetch(`${API_BASE}/api/conversations`);
        const data = await response.json();

        const html = data.conversations.map(conv => `
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

// Load and render graph
async function loadGraph() {
    const container = document.getElementById('graphContainer');
    const limit = document.getElementById('graphLimit').value;

    container.innerHTML = '<div class="loading">Loading graph...</div>';

    try {
        const response = await fetch(`${API_BASE}/api/graph?limit=${limit}`);
        const data = await response.json();

        if (data.nodes.length === 0) {
            container.innerHTML = '<div class="empty-state">No graph data available</div>';
            return;
        }

        renderGraph(data);
    } catch (error) {
        console.error('Failed to load graph:', error);
        container.innerHTML = '<div class="empty-state">Failed to load graph</div>';
    }
}

// Render graph using D3
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
        .attr('stroke', '#475569')
        .attr('stroke-width', 2);

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
        .attr('fill', '#94a3b8')
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
        insight: '#2563eb',
        code: '#10b981',
        question: '#f59e0b',
        reference: '#8b5cf6',
        decision: '#ef4444',
    };
    return colors[type] || '#64748b';
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `${tabName}-tab`);
    });
}
