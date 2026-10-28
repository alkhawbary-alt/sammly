// @ts-ignore
import PSD from 'psd';

export interface PsdJsLayerNode {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  opacity: number;
  blendMode: string;
  coords: {
    top: number;
    left: number;
    bottom: number;
    right: number;
    width: number;
    height: number;
  };
  text?: {
    value: string;
    fonts: string[];
    sizes: number[];
    colors: string[];
    alignment: string;
  };
  hasImage: boolean;
  children?: PsdJsLayerNode[];
}

export interface PsdJsExploreResult {
  header: {
    width: number;
    height: number;
    channels: number;
    depth: number;
    colorMode: string;
  };
  totalLayers: number;
  textLayers: number;
  imageLayers: number;
  groupLayers: number;
  parseTimeMs: number;
  tree: PsdJsLayerNode[];
  rawExport: any;
}

export async function exploreWithPsdJs(
  psdFilePathOrBuffer: string | Buffer
): Promise<PsdJsExploreResult> {
  const t0 = performance.now();

  let psdInstance: any;
  if (Buffer.isBuffer(psdFilePathOrBuffer)) {
    psdInstance = new PSD(psdFilePathOrBuffer);
  } else {
    psdInstance = PSD.fromFile(psdFilePathOrBuffer);
  }

  if (!psdInstance.parse()) {
    throw new Error('Failed to parse PSD with psd.js');
  }

  const root = psdInstance.tree();
  const header = psdInstance.header || {};
  const rawExport = root.export();

  let textLayers = 0;
  let imageLayers = 0;
  let groupLayers = 0;
  let totalLayers = 0;

  function buildNode(node: any, path: string): PsdJsLayerNode {
    totalLayers++;
    const isGroup = typeof node.isGroup === 'function' ? node.isGroup() : node.type === 'group';
    if (isGroup) {
      groupLayers++;
    } else {
      if (node.get?.('typeTool')) {
        textLayers++;
      } else {
        imageLayers++;
      }
    }

    const exported = node.export?.() || {};
    const coords = node.coords || { left: 0, top: 0, right: 0, bottom: 0 };
    const width = Math.max(0, coords.right - coords.left);
    const height = Math.max(0, coords.bottom - coords.top);

    let textDetail: PsdJsLayerNode['text'] = undefined;
    if (exported.text) {
      const font = exported.text.font || {};
      textDetail = {
        value: exported.text.value || '',
        fonts: font.names || [],
        sizes: font.sizes || [],
        colors: (font.colors || []).map((c: any) =>
          Array.isArray(c) ? `rgb(${c[0]}, ${c[1]}, ${c[2]})` : String(c)
        ),
        alignment: font.alignment?.[0] || 'left',
      };
    }

    const childrenNodes = node.children ? node.children() : [];
    const children = childrenNodes.map((child: any, idx: number) =>
      buildNode(child, `${path}_${idx}`)
    );

    return {
      id: `psdjs_${path}`,
      name: node.name || 'Unnamed Layer',
      type: isGroup ? 'group' : (exported.text ? 'text' : 'image'),
      visible: node.layer ? !!node.layer.visible : true,
      opacity: node.layer ? (node.layer.opacity ?? 255) / 255 : 1,
      blendMode: node.layer?.blendMode?.mode || 'normal',
      coords: {
        top: coords.top || 0,
        left: coords.left || 0,
        bottom: coords.bottom || 0,
        right: coords.right || 0,
        width,
        height,
      },
      text: textDetail,
      hasImage: !!(node.layer?.image && !isGroup && !exported.text),
      children: children.length > 0 ? children : undefined,
    };
  }

  const rootChildren = root.children ? root.children() : [];
  const tree = rootChildren.map((child: any, i: number) => buildNode(child, `${i}`));
  const t1 = performance.now();

  return {
    header: {
      width: header.width || 0,
      height: header.height || 0,
      channels: header.channels || 0,
      depth: header.depth || 8,
      colorMode: header.mode || 'RGB',
    },
    totalLayers,
    textLayers,
    imageLayers,
    groupLayers,
    parseTimeMs: Math.round(t1 - t0),
    tree,
    rawExport,
  };
}
