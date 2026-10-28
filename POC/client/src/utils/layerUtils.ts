import { Layer, TextStyle } from './htmlGenerator';
import { TextLayerItem } from '../TextSidebar';

/**
 * Recursively extracts all text layers from the design document layers.
 */
export function extractAllTextLayers(
  layers: Layer[],
  originalMap: Map<string, { text: string; style?: TextStyle }>,
  parentPath: string[] = []
): TextLayerItem[] {
  let result: TextLayerItem[] = [];

  for (const layer of layers) {
    const currentPath = [...parentPath, layer.name];
    if (layer.type === 'text') {
      const orig = originalMap.get(layer.id) || { text: layer.text || '', style: layer.style };
      result.push({
        layer,
        path: currentPath,
        originalText: orig.text,
        originalStyle: orig.style,
      });
    } else if (layer.type === 'group' && layer.children) {
      result = result.concat(extractAllTextLayers(layer.children, originalMap, currentPath));
    }
  }

  return result;
}

/**
 * Recursively updates a text layer's text content by its ID.
 */
export function updateLayerTextContent(
  layers: Layer[],
  targetId: string,
  newText: string
): Layer[] {
  return layers.map((layer) => {
    if (layer.id === targetId && layer.type === 'text') {
      return {
        ...layer,
        text: newText,
      };
    }
    if (layer.type === 'group' && layer.children) {
      return {
        ...layer,
        children: updateLayerTextContent(layer.children, targetId, newText),
      };
    }
    return layer;
  });
}

/**
 * Recursively updates a text layer's style by its ID.
 */
export function updateLayerStyleProperties(
  layers: Layer[],
  targetId: string,
  styleUpdates: Partial<TextStyle>
): Layer[] {
  return layers.map((layer) => {
    if (layer.id === targetId && layer.type === 'text') {
      return {
        ...layer,
        style: {
          ...(layer.style || {}),
          ...styleUpdates,
        },
      };
    }
    if (layer.type === 'group' && layer.children) {
      return {
        ...layer,
        children: updateLayerStyleProperties(layer.children, targetId, styleUpdates),
      };
    }
    return layer;
  });
}

/**
 * Transforms all text in all text layers (uppercase, lowercase, titlecase).
 */
export function transformAllLayersText(
  layers: Layer[],
  mode: 'uppercase' | 'lowercase' | 'titlecase'
): Layer[] {
  return layers.map((layer) => {
    if (layer.type === 'text') {
      let transformed = layer.text || '';
      if (mode === 'uppercase') {
        transformed = transformed.toUpperCase();
      } else if (mode === 'lowercase') {
        transformed = transformed.toLowerCase();
      } else if (mode === 'titlecase') {
        transformed = transformed.replace(/\b\w/g, (c) => c.toUpperCase());
      }
      return {
        ...layer,
        text: transformed,
      };
    }
    if (layer.type === 'group' && layer.children) {
      return {
        ...layer,
        children: transformAllLayersText(layer.children, mode),
      };
    }
    return layer;
  });
}

/**
 * Resets a single layer's text and style to its original parsed values.
 */
export function resetLayerToOriginal(
  layers: Layer[],
  targetId: string,
  originalMap: Map<string, { text: string; style?: TextStyle }>
): Layer[] {
  const orig = originalMap.get(targetId);
  if (!orig) return layers;

  return layers.map((layer) => {
    if (layer.id === targetId && layer.type === 'text') {
      return {
        ...layer,
        text: orig.text,
        style: orig.style ? { ...orig.style } : layer.style,
      };
    }
    if (layer.type === 'group' && layer.children) {
      return {
        ...layer,
        children: resetLayerToOriginal(layer.children, targetId, originalMap),
      };
    }
    return layer;
  });
}

/**
 * Resets all text layers back to their original parsed values.
 */
export function resetAllLayersToOriginal(
  layers: Layer[],
  originalMap: Map<string, { text: string; style?: TextStyle }>
): Layer[] {
  return layers.map((layer) => {
    if (layer.type === 'text') {
      const orig = originalMap.get(layer.id);
      if (orig) {
        return {
          ...layer,
          text: orig.text,
          style: orig.style ? { ...orig.style } : layer.style,
        };
      }
    }
    if (layer.type === 'group' && layer.children) {
      return {
        ...layer,
        children: resetAllLayersToOriginal(layer.children, originalMap),
      };
    }
    return layer;
  });
}

/**
 * Recursively updates a layer's position and bounding dimensions (x, y, width, height).
 */
export function updateLayerBounds(
  layers: Layer[],
  targetId: string,
  bounds: { x?: number; y?: number; width?: number; height?: number }
): Layer[] {
  return layers.map((layer) => {
    if (layer.id === targetId) {
      return {
        ...layer,
        x: bounds.x !== undefined ? Math.round(bounds.x) : layer.x,
        y: bounds.y !== undefined ? Math.round(bounds.y) : layer.y,
        width: bounds.width !== undefined ? Math.max(10, Math.round(bounds.width)) : layer.width,
        height: bounds.height !== undefined ? Math.max(10, Math.round(bounds.height)) : layer.height,
      };
    }
    if (layer.type === 'group' && layer.children) {
      return {
        ...layer,
        children: updateLayerBounds(layer.children, targetId, bounds),
      };
    }
    return layer;
  });
}

/**
 * Recursively finds a layer by its ID.
 */
export function findLayerById(layers: Layer[], targetId: string): Layer | null {
  for (const layer of layers) {
    if (layer.id === targetId) return layer;
    if (layer.type === 'group' && layer.children) {
      const found = findLayerById(layer.children, targetId);
      if (found) return found;
    }
  }
  return null;
}
