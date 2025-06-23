### **Specification: Refine Train Marker Direction Indicator**

#### **1. Goal**

Modify the train marker on the map to create a more intuitive and aesthetically pleasing "teardrop" shape. This involves replacing the current internal direction arrow with a triangle positioned on the *outer edge* of the main circle, dynamically pointing in the train's direction of travel.

#### **2. Context & Target File**

The changes will be made exclusively within the `TrainMap` component, which is responsible for rendering the Mapbox map and its layers.

*   **File to Modify:** `src/app/components/Map/TrainMap.tsx`

#### **3. Current Implementation Analysis**

The current map rendering in `TrainMap.tsx` uses a Mapbox GeoJSON source named `'trains'` and two layers:
1.  `'trains'`: A `'circle'` layer that paints the main colored dot for each train.
2.  `'train-arrows'`: A `'symbol'` layer that renders a text character (`➤`) inside the circle. Its rotation is determined by the `heading` property.

This two-layer approach is efficient and should be maintained. We will modify the `'train-arrows'` layer to achieve the new design.

#### **4. Implementation Plan**

The core of this task is to change the `text-field` of the symbol layer and use the `text-offset` layout property with a Mapbox expression to position it dynamically.

**Step-by-step instructions:**

1.  **Locate the `train-arrows` Layer Definition:** In `src/app/components/Map/TrainMap.tsx`, find the `map.current.addLayer` call for the layer with `id: 'train-arrows'`.

2.  **Update the Symbol Character:**
    *   Change the `text-field` from `'➤'` to an upward-pointing triangle, `'▲'`. This provides a better shape for the teardrop effect.

3.  **Implement Dynamic Positioning with `text-offset`:**
    *   The goal is to move the triangle from the center of the circle to its edge. The `text-offset` property allows us to shift the symbol from its anchor point (which is the train's coordinates).
    *   This requires a trigonometric calculation based on the train's `heading`. The offset will be calculated in `em` units.
    *   The formulas are:
        *   `offsetX = distance * sin(heading_in_radians)`
        *   `offsetY = -distance * cos(heading_in_radians)` (Negative Y because 0 degrees is North/Up)
    *   We will implement this using a Mapbox data expression. The `heading` property is in degrees, so it must be converted to radians for `sin` and `cos` functions (`radians = degrees * PI / 180`).

4.  **Modify the Layer Code:**
    *   Update the `layout` properties of the `'train-arrows'` layer. You will be adding `text-offset` and modifying `text-field` and `text-rotate`.

**Here is the specific code change required:**

**Find this existing layer definition:**
```typescript
// Inside src/app/components/Map/TrainMap.tsx

// OLD CODE
map.current.addLayer({
  id: 'train-arrows',
  type: 'symbol',
  source: 'trains',
  layout: {
    'text-field': '➤', // Back to original triangle
    'text-size': 16, // Larger size to make direction more obvious
    'text-rotate': ['-', ['get', 'heading'], 90], // Subtract 90° since ➤ points right instead of up
    'text-rotation-alignment': 'map',
    'text-allow-overlap': true,
    'text-ignore-placement': true,
    'text-letter-spacing': 0.1 // Slight spacing to make it appear longer
  },
  paint: {
    'text-color': '#ffffff',
    'text-halo-color': ['get', 'color'],
    'text-halo-width': 1.5 // Slightly thicker halo for better definition
  }
});
```

**Replace it with the following new definition:**
```typescript
// Inside src/app/components/Map/TrainMap.tsx

// NEW CODE
map.current.addLayer({
  id: 'train-arrows',
  type: 'symbol',
  source: 'trains',
  layout: {
    // 1. Use an upward-pointing triangle for a clean look.
    'text-field': '▲',

    // 2. The font size of the triangle. Tune if necessary.
    'text-size': 12,

    // 3. Rotate the triangle to match the train's heading.
    //    '▲' points up (0 degrees), so we just use the heading directly.
    'text-rotate': ['get', 'heading'],
    'text-rotation-alignment': 'map',

    // 4. This is the key change: Dynamically offset the triangle to the circle's edge.
    //    The offset distance (0.6 em) should be tuned to make the triangle's base
    //    just touch or slightly overlap the circle's edge.
    'text-offset': [
      'interpolate', ['linear'], ['get', 'heading'],
      0,   ['literal', [0, -0.6]],   // Heading 0 (North): No X offset, Up Y offset
      90,  ['literal', [0.6, 0]],    // Heading 90 (East): Right X offset, No Y offset
      180, ['literal', [0, 0.6]],    // Heading 180 (South): No X offset, Down Y offset
      270, ['literal', [-0.6, 0]]    // Heading 270 (West): Left X offset, No Y offset
    ],
    
    'text-allow-overlap': true,
    'text-ignore-placement': true
  },
  paint: {
    // Make the triangle the same color as the circle for a unified shape.
    'text-color': ['get', 'color'],
    // Add a white halo to distinguish it from the map background.
    'text-halo-color': '#ffffff',
    'text-halo-width': 1
  }
});
```
*Self-correction:* The initial thought of using `sin` and `cos` expressions directly can be complex to write and debug. A simpler and more readable approach for Mapbox GL is to use `interpolate`. It achieves the same circular offset by defining key points (0, 90, 180, 270 degrees) and letting Mapbox handle the smooth transition between them. This is more robust and easier to maintain. The `literal` expression is needed to tell Mapbox to treat the `[x, y]` array as a single value for the output.

#### **5. Expected Outcome**

After the change, the map display will be updated as follows:
*   Each train is represented by a colored circle.
*   Attached to the outer edge of this circle is a small, solid-colored triangle.
*   The triangle's color will match the circle's color.
*   The combined shape will resemble a teardrop or a map pin.
*   The pointy end of the teardrop (the triangle) will accurately point in the direction of the train's `heading`.
*   As a train turns, the triangle will smoothly rotate around the circumference of the circle, always indicating the correct direction.
*   The `'text-color'` of the symbol should be `['get', 'color']` to match the circle, and the `'text-halo-color'` should be `'#ffffff'` to create a crisp outline.