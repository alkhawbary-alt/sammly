import { DesignDocument, Layer } from '../types/design.js';

export interface FabricObject {
  type: string;
  version: string;
  originX: string;
  originY: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  angle?: number;
  visible?: boolean;
  id?: string;
  name?: string;
  [key: string]: any;
}

export interface FabricDocument {
  version: string;
  objects: FabricObject[];
  background?: string;
  width?: number;
  height?: number;
}

function layerToFabricObject(layer: Layer, assetUrlPrefix: string = ''): FabricObject {
  const common = {
    version: '5.3.0',
    originX: 'left',
    originY: 'top',
    left: layer.x,
    top: layer.y,
    width: layer.width,
    height: layer.height,
    opacity: layer.opacity ?? 1,
    angle: layer.rotation ?? 0,
    visible: layer.visible ?? true,
    id: layer.id,
    name: layer.name,
    selectable: true,
    hasControls: true,
  };

  switch (layer.type) {
    case 'text': {
      const style = layer.style || {};
      return {
        ...common,
        type: 'i-text',
        text: layer.text,
        fontSize: style.fontSize || 16,
        fontFamily: style.fontFamily || 'Arial',
        fill: style.color || '#000000',
        fontWeight: style.fontWeight || 'normal',
        fontStyle: style.fontStyle || 'normal',
        textAlign: style.textAlign || 'left',
        lineHeight: 1.15,
        charSpacing: style.letterSpacing ? style.letterSpacing * 10 : 0,
      };
    }
    case 'shape': {
      const isCircle = layer.shapeType === 'circle' || layer.shapeType === 'ellipse';
      const radius = typeof layer.borderRadius === 'number' ? layer.borderRadius : 0;
      return {
        ...common,
        type: isCircle ? 'circle' : 'rect',
        fill: layer.fill || 'transparent',
        stroke: layer.stroke || undefined,
        strokeWidth: layer.strokeWidth || 0,
        rx: radius,
        ry: radius,
      };
    }
    case 'image':
    case 'raster': {
      let src = layer.src;
      if (src && !src.startsWith('http') && !src.startsWith('data:')) {
        src = `${assetUrlPrefix}${src.startsWith('/') ? src : '/' + src}`;
      }
      return {
        ...common,
        type: 'image',
        src,
        crossOrigin: 'anonymous',
      };
    }
    case 'svg': {
      return {
        ...common,
        type: 'image',
        src: layer.src || '',
        svgContent: layer.svgContent,
      };
    }
    case 'group': {
      const children = (layer.children || []).map((child) =>
        layerToFabricObject(child, assetUrlPrefix)
      );
      return {
        ...common,
        type: 'group',
        objects: children,
      };
    }
  }
}

export function generateFabricJson(doc: DesignDocument, assetUrlPrefix: string = ''): FabricDocument {
  const workspaceRect: FabricObject = {
    type: 'rect',
    version: '5.3.0',
    originX: 'left',
    originY: 'top',
    left: 0,
    top: 0,
    width: doc.width,
    height: doc.height,
    fill: doc.backgroundColor || '#ffffff',
    id: 'workspace',
    selectable: false,
    hasControls: false,
  };

  const fabricLayers = doc.layers.map((layer) => layerToFabricObject(layer, assetUrlPrefix));

  return {
    version: '5.3.0',
    width: doc.width,
    height: doc.height,
    background: doc.backgroundColor || '#ffffff',
    objects: [workspaceRect, ...fabricLayers],
  };
}
