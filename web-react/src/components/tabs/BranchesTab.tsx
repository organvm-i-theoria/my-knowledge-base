import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { unitsApi } from '../../api/client';
import { useBranchStore } from '../../stores/branchStore';
import type {
  BranchDirection,
  BranchEdge,
  BranchUnitSummary,
  UnitBranchResponse,
} from '../../types';

interface VisibleBranchUnit {
  unit: BranchUnitSummary;
  edges: BranchEdge[];
  primaryEdge: BranchEdge | null;
}

export interface VisibleBranchColumn {
  depth: number;
  parentId: string | null;
  selectedUnitId: string | null;
  units: VisibleBranchUnit[];
}

function edgeConfidence(edge: BranchEdge): number {
  return edge.confidence ?? -1;
}

function sortEdgesByPriority(edges: BranchEdge[]): BranchEdge[] {
  return [...edges].sort((a, b) => {
    const confidenceDelta = edgeConfidence(b) - edgeConfidence(a);
    if (confidenceDelta !== 0) return confidenceDelta;

    const aDate = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bDate = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (bDate !== aDate) return bDate - aDate;

    if (a.relationshipType !== b.relationshipType) {
      return a.relationshipType.localeCompare(b.relationshipType);
    }
    return a.direction.localeCompare(b.direction);
  });
}

function isEdgeFromParent(edge: BranchEdge, parentId: string): boolean {
  return edge.direction === 'out'
    ? edge.fromUnitId === parentId
    : edge.toUnitId === parentId;
}

function edgeChildId(edge: BranchEdge): string {
  return edge.direction === 'out' ? edge.toUnitId : edge.fromUnitId;
}

export function deriveVisibleBranchColumns(
  data: UnitBranchResponse | null,
  selectedPath: string[],
): VisibleBranchColumn[] {
  if (!data) return [];

  const rootId = data.root.id;
  const normalizedPath =
    selectedPath.length > 0 && selectedPath[0] === rootId
      ? selectedPath
      : [rootId];

  const columnsByDepth = new Map(data.columns.map((column) => [column.depth, column]));
  const rootColumn = columnsByDepth.get(0);
  const visible: VisibleBranchColumn[] = [
    {
      depth: 0,
      parentId: null,
      selectedUnitId: normalizedPath[0] ?? rootId,
      units: [
        {
          unit: rootColumn?.units[0] ?? data.root,
          edges: [],
          primaryEdge: null,
        },
      ],
    },
  ];

  for (let depth = 1; depth <= data.meta.depth; depth++) {
    const parentId = normalizedPath[depth - 1];
    if (!parentId) break;

    const unitsAtDepth = columnsByDepth.get(depth)?.units ?? [];
    const candidateEdges = data.edges
      .filter((edge) => edge.depth === depth && isEdgeFromParent(edge, parentId));

    if (candidateEdges.length === 0) {
      if (depth === 1) {
        visible.push({
          depth,
          parentId,
          selectedUnitId: null,
          units: [],
        });
      }
      break;
    }

    const edgesByChild = new Map<string, BranchEdge[]>();
    for (const edge of candidateEdges) {
      const childId = edgeChildId(edge);
      if (!edgesByChild.has(childId)) {
        edgesByChild.set(childId, []);
      }
      edgesByChild.get(childId)!.push(edge);
    }

    const orderedChildIds = Array.from(edgesByChild.keys()).sort((a, b) => {
      const aTop = sortEdgesByPriority(edgesByChild.get(a) || [])[0];
      const bTop = sortEdgesByPriority(edgesByChild.get(b) || [])[0];
      if (!aTop || !bTop) return a.localeCompare(b);
      const confidenceDelta = edgeConfidence(bTop) - edgeConfidence(aTop);
      if (confidenceDelta !== 0) return confidenceDelta;
      const aDate = aTop.createdAt ? Date.parse(aTop.createdAt) : 0;
      const bDate = bTop.createdAt ? Date.parse(bTop.createdAt) : 0;
      if (bDate !== aDate) return bDate - aDate;
      return a.localeCompare(b);
    });

    const unitsById = new Map(unitsAtDepth.map((unit) => [unit.id, unit]));
    const columnUnits: VisibleBranchUnit[] = orderedChildIds
      .map<VisibleBranchUnit | null>((childId) => {
        const unit = unitsById.get(childId);
        if (!unit) return null;
        const sortedEdges = sortEdgesByPriority(edgesByChild.get(childId) || []);
        return {
          unit,
          edges: sortedEdges,
          primaryEdge: sortedEdges[0] || null,
        };
      })
      .filter((entry): entry is VisibleBranchUnit => entry !== null);

    if (columnUnits.length === 0) {
      if (depth === 1) {
        visible.push({
          depth,
          parentId,
          selectedUnitId: null,
          units: [],
        });
      }
      break;
    }

    const selectedUnitId = normalizedPath[depth] || null;
    visible.push({
      depth,
      parentId,
      selectedUnitId,
      units: columnUnits,
    });

    if (!selectedUnitId) {
      break;
    }
  }

  return visible;
}

export interface BranchesViewProps {
  rootUnitId: string | null;
  data: UnitBranchResponse | null;
  selectedPath: string[];
  loading: boolean;
  error: string | null;
  depth: number;
  direction: BranchDirection;
  limitPerNode: number;
  relationshipType: string;
  onDepthChange: (depth: number) => void;
  onDirectionChange: (direction: BranchDirection) => void;
  onLimitPerNodeChange: (limit: number) => void;
  onRelationshipTypeChange: (value: string) => void;
  onSelectUnit: (depth: number, unitId: string) => void;
  onUseAsRoot: (unitId: string) => void;
  onClearRoot: () => void;
  onRefresh: () => void;
}

export function BranchesView({
  rootUnitId,
  data,
  selectedPath,
  loading,
  error,
  depth,
  direction,
  limitPerNode,
  relationshipType,
  onDepthChange,
  onDirectionChange,
  onLimitPerNodeChange,
  onRelationshipTypeChange,
  onSelectUnit,
  onUseAsRoot,
  onClearRoot,
  onRefresh,
}: BranchesViewProps) {
  const visibleColumns = useMemo(
    () => deriveVisibleBranchColumns(data, selectedPath),
    [data, selectedPath],
  );
  const showNoRelated = Boolean(
    data &&
      visibleColumns.length > 1 &&
      visibleColumns[1] &&
      visibleColumns[1].units.length === 0,
  );

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--accent-3)]">Branching View</h2>
            <p className="text-sm text-[var(--ink-muted)]">
              Traverse typed relationships as expandable columns.
            </p>
          </div>
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={onRefresh} disabled={!rootUnitId || loading}>
              Refresh
            </button>
            <button className="btn-secondary" onClick={onClearRoot} disabled={!rootUnitId}>
              Clear Root
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Depth</span>
            <input
              className="input"
              type="number"
              min={1}
              max={4}
              value={depth}
              onChange={(event) => onDepthChange(Number.parseInt(event.target.value, 10) || 1)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Direction</span>
            <select
              className="input"
              value={direction}
              onChange={(event) => onDirectionChange(event.target.value as BranchDirection)}
            >
              <option value="out">out</option>
              <option value="in">in</option>
              <option value="both">both</option>
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Limit Per Node</span>
            <input
              className="input"
              type="number"
              min={1}
              max={25}
              value={limitPerNode}
              onChange={(event) => onLimitPerNodeChange(Number.parseInt(event.target.value, 10) || 1)}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-[var(--ink-muted)]">Relationship Type Filter</span>
            <input
              className="input"
              placeholder="builds_on,references"
              value={relationshipType}
              onChange={(event) => onRelationshipTypeChange(event.target.value)}
            />
          </label>
        </div>
      </div>

      {!rootUnitId && (
        <div className="card p-6 text-[var(--ink-muted)]">
          Select a search result and click <strong>Explore Branches</strong> to start.
        </div>
      )}

      {rootUnitId && loading && (
        <div className="card p-6 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-[var(--accent-2)] border-t-transparent rounded-full mx-auto" />
          <p className="mt-3 text-[var(--ink-muted)]">Loading branch traversal...</p>
        </div>
      )}

      {rootUnitId && error && (
        <div className="card p-6 text-[var(--accent)]">
          Failed to load branch traversal: {error}
        </div>
      )}

      {rootUnitId && !loading && !error && data && (
        <div className="space-y-3">
          <div className="text-sm text-[var(--ink-muted)]">
            Root: <strong>{data.root.title}</strong> ({data.root.id}) · edges: {data.meta.edgeCount} · visited:{' '}
            {data.meta.visitedCount} · truncated: {data.meta.truncated ? 'yes' : 'no'}
          </div>

          <div className="flex gap-4 overflow-x-auto pb-2">
            {visibleColumns.map((column) => (
              <section key={column.depth} className="card p-3 min-w-[18rem] max-w-[20rem] shrink-0">
                <h3 className="font-semibold mb-2">
                  {column.depth === 0 ? 'Root' : `Depth ${column.depth}`}
                </h3>

                {column.units.length === 0 ? (
                  <p className="text-sm text-[var(--ink-muted)]">No related units at this depth/filter.</p>
                ) : (
                  <div className="space-y-2">
                    {column.units.map(({ unit, primaryEdge }) => {
                      const selected = column.selectedUnitId === unit.id;
                      const confidenceText =
                        primaryEdge?.confidence === null || primaryEdge?.confidence === undefined
                          ? 'n/a'
                          : `${Math.round(primaryEdge.confidence * 100)}%`;

                      return (
                        <div
                          key={unit.id}
                          className={`w-full text-left p-2 rounded border transition-colors ${
                            selected
                              ? 'border-[var(--accent-2)] bg-[var(--surface)]'
                              : 'border-[var(--border)] hover:border-[var(--accent-2)]'
                          }`}
                        >
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => onSelectUnit(column.depth, unit.id)}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <p className="font-medium line-clamp-2">{unit.title}</p>
                                <p className="text-xs text-[var(--ink-muted)]">{unit.id}</p>
                              </div>
                              <span className="type-badge">{unit.type}</span>
                            </div>

                            {primaryEdge && (
                              <p className="mt-2 text-xs text-[var(--ink-muted)]">
                                {primaryEdge.relationshipType} · {confidenceText}
                              </p>
                            )}
                          </button>

                          <div className="mt-2">
                            <button
                              type="button"
                              className="text-xs text-[var(--accent-2)] hover:underline"
                              onClick={() => onUseAsRoot(unit.id)}
                            >
                              Use as root
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>

          {showNoRelated && (
            <div className="card p-4 text-sm text-[var(--ink-muted)]">
              No related units at this depth/filter.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function BranchesTab() {
  const {
    rootUnitId,
    depth,
    direction,
    limitPerNode,
    relationshipType,
    selectedPath,
    setDepth,
    setDirection,
    setLimitPerNode,
    setRelationshipType,
    selectUnitAtDepth,
    setRootUnit,
    clearRoot,
  } = useBranchStore();

  const branchQuery = useQuery({
    queryKey: ['unit-branches', rootUnitId, depth, direction, limitPerNode, relationshipType],
    queryFn: async () => {
      if (!rootUnitId) return null;
      const response = await unitsApi.getBranches(rootUnitId, {
        depth,
        direction,
        limitPerNode,
        relationshipType: relationshipType || undefined,
      });
      return response.data;
    },
    enabled: Boolean(rootUnitId),
    staleTime: 30_000,
  });

  const errorMessage =
    branchQuery.error instanceof Error ? branchQuery.error.message : null;

  return (
    <BranchesView
      rootUnitId={rootUnitId}
      data={branchQuery.data ?? null}
      selectedPath={selectedPath}
      loading={branchQuery.isFetching}
      error={errorMessage}
      depth={depth}
      direction={direction}
      limitPerNode={limitPerNode}
      relationshipType={relationshipType}
      onDepthChange={setDepth}
      onDirectionChange={setDirection}
      onLimitPerNodeChange={setLimitPerNode}
      onRelationshipTypeChange={setRelationshipType}
      onSelectUnit={selectUnitAtDepth}
      onUseAsRoot={setRootUnit}
      onClearRoot={clearRoot}
      onRefresh={() => {
        if (rootUnitId) {
          branchQuery.refetch();
        }
      }}
    />
  );
}
