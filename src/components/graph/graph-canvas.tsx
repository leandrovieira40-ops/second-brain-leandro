'use client';

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { degrees, type GraphEdge, type GraphNode } from '@/lib/graph/neighborhood';
import { noteHref } from '@/lib/notes/href';

interface SimNode extends SimulationNodeDatum {
  path: string;
  title: string;
  degree: number;
}
type SimLink = SimulationLinkDatum<SimNode>;

const cssVar = (name: string) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';

/**
 * Visão em grafo (canvas + d3-force), no estilo do Obsidian: arraste o fundo para mover, use a
 * roda do mouse para aproximar, passe o mouse para destacar vizinhos e clique para abrir a nota.
 */
export function GraphCanvas({
  nodes,
  edges,
  focusPath,
  className,
  label,
}: {
  nodes: readonly GraphNode[];
  edges: readonly GraphEdge[];
  /** Nota em destaque (grafo local). */
  focusPath?: string;
  className?: string;
  label: string;
}) {
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    const degree = degrees(edges);
    const simNodes: SimNode[] = nodes.map((node) => ({
      path: node.path,
      title: node.title,
      degree: degree.get(node.path) ?? 0,
    }));
    const byPath = new Map(simNodes.map((node) => [node.path, node]));
    const simLinks: SimLink[] = edges
      .filter((edge) => byPath.has(edge.source) && byPath.has(edge.target))
      .map((edge) => ({ source: byPath.get(edge.source)!, target: byPath.get(edge.target)! }));
    const neighbors = new Map<string, Set<string>>();
    for (const edge of edges) {
      if (!neighbors.has(edge.source)) neighbors.set(edge.source, new Set());
      if (!neighbors.has(edge.target)) neighbors.set(edge.target, new Set());
      neighbors.get(edge.source)!.add(edge.target);
      neighbors.get(edge.target)!.add(edge.source);
    }

    const view = { x: 0, y: 0, k: 1 };
    let width = 0;
    let height = 0;
    let hovered: SimNode | null = null;
    let dragging: SimNode | null = null;
    let panning: { x: number; y: number } | null = null;
    let moved = false;
    // Até a pessoa mexer (zoom/arrastar), a vista se ajusta para caber todas as notas.
    let autoFit = true;

    const radius = (node: SimNode) => 3 + Math.sqrt(node.degree) * 2.2;
    const colors = () => ({
      node: cssVar('--graph-node'),
      line: cssVar('--graph-line'),
      accent: cssVar('--primary'),
      text: cssVar('--foreground'),
      muted: cssVar('--muted-foreground'),
    });
    let palette = colors();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const ratio = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (autoFit) fit();
      draw();
    };

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.save();
      context.translate(width / 2 + view.x, height / 2 + view.y);
      context.scale(view.k, view.k);
      const active = hovered ?? (focusPath ? (byPath.get(focusPath) ?? null) : null);
      const near = active ? (neighbors.get(active.path) ?? new Set<string>()) : null;

      context.lineWidth = 1 / view.k;
      for (const link of simLinks) {
        const source = link.source as SimNode;
        const target = link.target as SimNode;
        const lit = active && (source === active || target === active);
        context.strokeStyle = lit ? palette.accent : palette.line;
        context.globalAlpha = active && !lit ? 0.25 : lit ? 0.9 : 0.6;
        context.beginPath();
        context.moveTo(source.x!, source.y!);
        context.lineTo(target.x!, target.y!);
        context.stroke();
      }

      for (const node of simNodes) {
        const isActive = node === active;
        const isNear = near?.has(node.path) ?? false;
        context.globalAlpha = active && !isActive && !isNear ? 0.35 : 1;
        context.fillStyle = isActive || node.path === focusPath ? palette.accent : palette.node;
        context.beginPath();
        context.arc(node.x!, node.y!, radius(node), 0, Math.PI * 2);
        context.fill();
      }

      // Rótulos: sempre para a nota ativa e vizinhas; para as demais, só com zoom.
      const fontSize = 12 / view.k;
      context.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
      context.textAlign = 'center';
      context.textBaseline = 'top';
      for (const node of simNodes) {
        const isActive = node === active;
        const isNear = near?.has(node.path) ?? false;
        const show =
          isActive || isNear || view.k >= 1.4 || (simNodes.length <= 40 && view.k >= 0.8);
        if (!show) continue;
        context.globalAlpha = active && !isActive && !isNear ? 0.35 : 1;
        context.fillStyle = isActive ? palette.text : palette.muted;
        const title = node.title.length > 40 ? `${node.title.slice(0, 39)}…` : node.title;
        context.fillText(title, node.x!, node.y! + radius(node) + 3 / view.k);
      }
      context.restore();
      context.globalAlpha = 1;
    };

    const simulation: Simulation<SimNode, SimLink> = forceSimulation(simNodes)
      .force('link', forceLink<SimNode, SimLink>(simLinks).distance(60).strength(0.5))
      .force('charge', forceManyBody().strength(-140))
      .force('center', forceCenter(0, 0))
      .force(
        'collide',
        forceCollide<SimNode>().radius((node) => radius(node) + 4),
      )
      // Gravidade leve: notas sem ligações não fogem para longe.
      .force('x', forceX(0).strength(0.06))
      .force('y', forceY(0).strength(0.06))
      .on('tick', () => {
        if (autoFit) fit();
        draw();
      });

    function fit() {
      if (simNodes.length === 0 || width === 0) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const node of simNodes) {
        minX = Math.min(minX, node.x!);
        maxX = Math.max(maxX, node.x!);
        minY = Math.min(minY, node.y!);
        maxY = Math.max(maxY, node.y!);
      }
      const padding = 60;
      const k = Math.min(
        2.5,
        (width - padding * 2) / Math.max(maxX - minX, 1),
        (height - padding * 2) / Math.max(maxY - minY, 1),
      );
      view.k = Math.max(0.15, k);
      view.x = -((minX + maxX) / 2) * view.k;
      view.y = -((minY + maxY) / 2) * view.k;
    }

    const toWorld = (event: { clientX: number; clientY: number }) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - width / 2 - view.x) / view.k,
        y: (event.clientY - rect.top - height / 2 - view.y) / view.k,
      };
    };
    const nodeAt = (event: { clientX: number; clientY: number }) => {
      const point = toWorld(event);
      let best: SimNode | null = null;
      let bestDistance = Infinity;
      for (const node of simNodes) {
        const distance = Math.hypot(node.x! - point.x, node.y! - point.y);
        if (distance < radius(node) + 6 / view.k && distance < bestDistance) {
          best = node;
          bestDistance = distance;
        }
      }
      return best;
    };

    const onPointerDown = (event: PointerEvent) => {
      autoFit = false;
      canvas.setPointerCapture(event.pointerId);
      moved = false;
      const node = nodeAt(event);
      if (node) {
        dragging = node;
        node.fx = node.x;
        node.fy = node.y;
        simulation.alphaTarget(0.3).restart();
      } else {
        panning = { x: event.clientX - view.x, y: event.clientY - view.y };
      }
    };
    const onPointerMove = (event: PointerEvent) => {
      if (dragging) {
        moved = true;
        const point = toWorld(event);
        dragging.fx = point.x;
        dragging.fy = point.y;
        return;
      }
      if (panning) {
        moved = true;
        view.x = event.clientX - panning.x;
        view.y = event.clientY - panning.y;
        draw();
        return;
      }
      const node = nodeAt(event);
      if (node !== hovered) {
        hovered = node;
        canvas.style.cursor = node ? 'pointer' : 'grab';
        draw();
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      const clicked = !moved ? nodeAt(event) : null;
      if (dragging) {
        dragging.fx = null;
        dragging.fy = null;
        simulation.alphaTarget(0);
      }
      dragging = null;
      panning = null;
      if (clicked) router.push(noteHref(clicked.path));
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      autoFit = false;
      const rect = canvas.getBoundingClientRect();
      const cx = event.clientX - rect.left - width / 2;
      const cy = event.clientY - rect.top - height / 2;
      const factor = Math.exp(-event.deltaY * 0.0015);
      const k = Math.min(6, Math.max(0.15, view.k * factor));
      view.x = cx - ((cx - view.x) * k) / view.k;
      view.y = cy - ((cy - view.y) * k) / view.k;
      view.k = k;
      draw();
    };
    const onLeave = () => {
      if (hovered) {
        hovered = null;
        draw();
      }
    };

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(() => {
      palette = colors();
      draw();
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.style.cursor = 'grab';
    resize();

    return () => {
      simulation.stop();
      observer.disconnect();
      themeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [nodes, edges, focusPath, router]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={label}
      className={className ?? 'block h-full w-full touch-none'}
    />
  );
}
