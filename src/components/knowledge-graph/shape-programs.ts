/**
 * WebGL node programs for the class shapes (OVERSTORY-APPS-R030.11.1, .5).
 *
 * Color never carries meaning alone: each of the 8 shapes of `CLASS_SHAPES` has its own program, so
 * the same renderer draws every shape. A program reuses the circle vertex stage and swaps only the
 * fragment stage for a signed-distance function of the shape.
 */
import { NodeCircleProgram } from 'sigma/rendering'
import type { NodeProgramType } from 'sigma/rendering'
import type { ClassShape } from '@/lib/graph-semantics'

/** GLSL signed distance of each shape in a unit disc, negative inside. */
const SDF: Record<ClassShape, string> = {
  circle: 'return length(p) - 1.0;',
  square: 'vec2 d = abs(p) - vec2(0.82); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);',
  diamond: 'return (abs(p.x) + abs(p.y)) - 1.0;',
  triangle: `
    p.y = -p.y * 1.0 + 0.2;
    const float k = 1.7320508;
    p.x = abs(p.x) - 0.95;
    p.y = p.y + 0.95 / k;
    if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0;
    p.x -= clamp(p.x, -1.9, 0.0);
    return -length(p) * sign(p.y);`,
  hexagon: `
    const vec3 k = vec3(-0.866025404, 0.5, 0.577350269);
    p = abs(p);
    p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
    p -= vec2(clamp(p.x, -k.z * 0.92, k.z * 0.92), 0.92);
    return length(p) * sign(p.y);`,
  cross: `
    vec2 q = abs(p);
    vec2 a = q - vec2(0.95, 0.32);
    vec2 b = q - vec2(0.32, 0.95);
    float da = length(max(a, 0.0)) + min(max(a.x, a.y), 0.0);
    float db = length(max(b, 0.0)) + min(max(b.x, b.y), 0.0);
    return min(da, db);`,
  star: `
    const vec2 k1 = vec2(0.809016994375, -0.587785252292);
    const vec2 k2 = vec2(-0.809016994375, -0.587785252292);
    p.x = abs(p.x);
    p -= 2.0 * max(dot(k1, p), 0.0) * k1;
    p -= 2.0 * max(dot(k2, p), 0.0) * k2;
    p.x = abs(p.x);
    p.y -= 1.0;
    vec2 ba = 0.5 * vec2(0.587785252292, 0.809016994375) - vec2(0.0, 1.0);
    float h = clamp(dot(p, ba) / dot(ba, ba), 0.0, 1.0);
    return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y);`,
  ring: 'return abs(length(p) - 0.74) - 0.26;',
}

function fragmentSource(shape: ClassShape): string {
  return `
precision highp float;

varying vec4 v_color;
varying vec2 v_diffVector;
varying float v_radius;

uniform float u_correctionRatio;

const vec4 transparent = vec4(0.0, 0.0, 0.0, 0.0);

float sdShape(vec2 p) {
  ${SDF[shape]}
}

void main(void) {
  float border = u_correctionRatio * 2.0;
  float dist = sdShape(v_diffVector / v_radius) * v_radius + border;

  #ifdef PICKING_MODE
  if (dist > border)
    gl_FragColor = transparent;
  else
    gl_FragColor = v_color;
  #else
  float t = 0.0;
  if (dist > border)
    t = 1.0;
  else if (dist > 0.0)
    t = dist / border;
  gl_FragColor = mix(v_color, transparent, t);
  #endif
}
`
}

function shapeProgram(shape: ClassShape): NodeProgramType {
  const source = fragmentSource(shape)
  return class ShapeProgram extends NodeCircleProgram {
    getDefinition() {
      return { ...super.getDefinition(), FRAGMENT_SHADER_SOURCE: source }
    }
  }
}

/** One program per shape, keyed by shape name; a node's `type` attribute selects it. */
export function createShapePrograms(shapes: readonly ClassShape[]): Record<string, NodeProgramType> {
  return Object.fromEntries(shapes.map((shape) => [shape, shapeProgram(shape)]))
}
