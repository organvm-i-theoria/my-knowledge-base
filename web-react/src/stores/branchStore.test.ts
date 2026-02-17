import { beforeEach, describe, expect, it } from 'vitest';
import { useBranchStore } from './branchStore';

describe('branchStore', () => {
  beforeEach(() => {
    useBranchStore.setState({
      rootUnitId: null,
      depth: 3,
      direction: 'out',
      limitPerNode: 12,
      relationshipType: '',
      selectedPath: [],
    });
  });

  it('sets root and initializes path', () => {
    const store = useBranchStore.getState();
    store.setRootUnit('unit-root');

    const next = useBranchStore.getState();
    expect(next.rootUnitId).toBe('unit-root');
    expect(next.selectedPath).toEqual(['unit-root']);
  });

  it('expands selected path when selecting deeper columns', () => {
    const store = useBranchStore.getState();
    store.setRootUnit('unit-root');
    store.selectUnitAtDepth(1, 'unit-a');
    store.selectUnitAtDepth(2, 'unit-b');

    const next = useBranchStore.getState();
    expect(next.selectedPath).toEqual(['unit-root', 'unit-a', 'unit-b']);
  });

  it('resets selection when root changes', () => {
    const store = useBranchStore.getState();
    store.setRootUnit('unit-root');
    store.selectUnitAtDepth(1, 'unit-a');
    store.selectUnitAtDepth(2, 'unit-b');
    store.setRootUnit('unit-new-root');

    const next = useBranchStore.getState();
    expect(next.rootUnitId).toBe('unit-new-root');
    expect(next.selectedPath).toEqual(['unit-new-root']);
  });

  it('clamps depth and limit settings', () => {
    const store = useBranchStore.getState();
    store.setDepth(999);
    store.setLimitPerNode(0);

    const next = useBranchStore.getState();
    expect(next.depth).toBe(4);
    expect(next.limitPerNode).toBe(1);
  });
});
