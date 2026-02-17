import { describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { UnitBranchResponse } from '../../types';
import { BranchesView, deriveVisibleBranchColumns } from './BranchesTab';

const noop = () => {};

const sampleData: UnitBranchResponse = {
  root: {
    id: 'root',
    title: 'Root Unit',
    type: 'insight',
    category: 'programming',
  },
  columns: [
    {
      depth: 0,
      units: [
        {
          id: 'root',
          title: 'Root Unit',
          type: 'insight',
          category: 'programming',
        },
      ],
    },
    {
      depth: 1,
      units: [
        {
          id: 'child-a',
          title: 'Child A',
          type: 'code',
          category: 'programming',
        },
      ],
    },
  ],
  edges: [
    {
      fromUnitId: 'root',
      toUnitId: 'child-a',
      relationshipType: 'builds_on',
      source: 'manual',
      confidence: 0.9,
      explanation: 'example',
      createdAt: '2026-02-17T00:00:00.000Z',
      direction: 'out',
      depth: 1,
    },
  ],
  meta: {
    depth: 3,
    direction: 'out',
    limitPerNode: 12,
    relationshipTypes: [],
    truncated: false,
    filteredBackEdges: 0,
    visitedCount: 2,
    edgeCount: 1,
  },
};

describe('BranchesTab helpers', () => {
  it('derives root + first column from selected path', () => {
    const columns = deriveVisibleBranchColumns(sampleData, ['root']);
    expect(columns.length).toBe(2);
    expect(columns[0].units[0].unit.id).toBe('root');
    expect(columns[1].units[0].unit.id).toBe('child-a');
  });
});

describe('BranchesView', () => {
  it('renders root selection empty state', () => {
    const html = renderToStaticMarkup(
      <BranchesView
        rootUnitId={null}
        data={null}
        selectedPath={[]}
        loading={false}
        error={null}
        depth={3}
        direction="out"
        limitPerNode={12}
        relationshipType=""
        onDepthChange={noop}
        onDirectionChange={noop}
        onLimitPerNodeChange={noop}
        onRelationshipTypeChange={noop}
        onSelectUnit={noop}
        onUseAsRoot={noop}
        onClearRoot={noop}
        onRefresh={noop}
      />
    );

    expect(html).toContain('Select a search result and click');
    expect(html).toContain('Explore Branches');
  });

  it('renders loading state', () => {
    const html = renderToStaticMarkup(
      <BranchesView
        rootUnitId="root"
        data={null}
        selectedPath={['root']}
        loading={true}
        error={null}
        depth={3}
        direction="out"
        limitPerNode={12}
        relationshipType=""
        onDepthChange={noop}
        onDirectionChange={noop}
        onLimitPerNodeChange={noop}
        onRelationshipTypeChange={noop}
        onSelectUnit={noop}
        onUseAsRoot={noop}
        onClearRoot={noop}
        onRefresh={noop}
      />
    );

    expect(html).toContain('Loading branch traversal');
  });

  it('renders populated branch columns with relationship metadata', () => {
    const html = renderToStaticMarkup(
      <BranchesView
        rootUnitId="root"
        data={sampleData}
        selectedPath={['root']}
        loading={false}
        error={null}
        depth={3}
        direction="out"
        limitPerNode={12}
        relationshipType=""
        onDepthChange={noop}
        onDirectionChange={noop}
        onLimitPerNodeChange={noop}
        onRelationshipTypeChange={noop}
        onSelectUnit={noop}
        onUseAsRoot={noop}
        onClearRoot={noop}
        onRefresh={noop}
      />
    );

    expect(html).toContain('Root Unit');
    expect(html).toContain('Child A');
    expect(html).toContain('builds_on');
    expect(html).toContain('90%');
  });

  it('renders explicit empty related state', () => {
    const emptyData: UnitBranchResponse = {
      ...sampleData,
      columns: [sampleData.columns[0], { depth: 1, units: [] }],
      edges: [],
      meta: { ...sampleData.meta, edgeCount: 0, visitedCount: 1, filteredBackEdges: 0 },
    };

    const html = renderToStaticMarkup(
      <BranchesView
        rootUnitId="root"
        data={emptyData}
        selectedPath={['root']}
        loading={false}
        error={null}
        depth={3}
        direction="out"
        limitPerNode={12}
        relationshipType=""
        onDepthChange={noop}
        onDirectionChange={noop}
        onLimitPerNodeChange={noop}
        onRelationshipTypeChange={noop}
        onSelectUnit={noop}
        onUseAsRoot={noop}
        onClearRoot={noop}
        onRefresh={noop}
      />
    );

    expect(html).toContain('No related units at this depth/filter.');
  });

  it('calls callbacks via props without crashing when rendered', () => {
    const onRefresh = vi.fn();
    const html = renderToStaticMarkup(
      <BranchesView
        rootUnitId="root"
        data={sampleData}
        selectedPath={['root']}
        loading={false}
        error={null}
        depth={3}
        direction="out"
        limitPerNode={12}
        relationshipType=""
        onDepthChange={noop}
        onDirectionChange={noop}
        onLimitPerNodeChange={noop}
        onRelationshipTypeChange={noop}
        onSelectUnit={noop}
        onUseAsRoot={noop}
        onClearRoot={noop}
        onRefresh={onRefresh}
      />
    );

    expect(html).toContain('Branching View');
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
