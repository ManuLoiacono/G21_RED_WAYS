import * as Cesium from "cesium";

/**
 * Visual look of the scene (tested in Gale, cross-check E21).
 * - Custom shader: screen-space derivative normals + Martian palette + low sun + haze.
 *   Needed because the Cesium Mars texture has the relief baked in and barely reacts to light.
 * - Cast shadows with a tuned bias (without it, banding appears).
 * - Do NOT use scene.verticalExaggeration: with this tileset it breaks tile selection.
 */

/** Sun direction (Mars fixed frame) from azimuth/elevation at a point on the surface. */
export function sunDirectionWC(lonDeg: number, latDeg: number, azimuthDeg: number, elevationDeg: number): Cesium.Cartesian3 {
  const site = Cesium.Cartesian3.fromDegrees(lonDeg, latDeg, -3330, Cesium.Ellipsoid.MARS);
  const enu = Cesium.Transforms.eastNorthUpToFixedFrame(site, Cesium.Ellipsoid.MARS);
  const az = Cesium.Math.toRadians(azimuthDeg);
  const el = Cesium.Math.toRadians(elevationDeg);
  const local = new Cesium.Cartesian3(Math.sin(az) * Math.cos(el), Math.cos(az) * Math.cos(el), Math.sin(el));
  const dir = Cesium.Matrix4.multiplyByPointAsVector(enu, local, new Cesium.Cartesian3());
  return Cesium.Cartesian3.normalize(dir, dir);
}

export function marsShader(sunWC: Cesium.Cartesian3): Cesium.CustomShader {
  return new Cesium.CustomShader({
    lightingModel: Cesium.LightingModel.UNLIT,
    uniforms: {
      u_sunWC: { type: Cesium.UniformType.VEC3, value: sunWC },
      u_hazeDist: { type: Cesium.UniformType.FLOAT, value: 25000.0 },
    },
    fragmentShaderText: /* glsl */ `
      void fragmentMain(FragmentInput fsInput, inout czm_modelMaterial material) {
        vec3 p = fsInput.attributes.positionEC;
        vec3 n = normalize(cross(dFdx(p), dFdy(p)));
        if (dot(n, -p) < 0.0) n = -n;
        vec3 L = normalize((czm_view * vec4(u_sunWC, 0.0)).xyz);
        float lam = clamp(dot(n, L), 0.0, 1.0);

        float g = dot(material.diffuse, vec3(0.299, 0.587, 0.114));
        g = clamp((g - 0.10) * 1.6, 0.0, 1.0);
        vec3 dark = vec3(0.20, 0.08, 0.035), mid = vec3(0.70, 0.36, 0.17), light = vec3(1.0, 0.78, 0.55);
        vec3 col = g < 0.5 ? mix(dark, mid, g * 2.0) : mix(mid, light, (g - 0.5) * 2.0);

        float shade = mix(1.0, 0.18 + 1.6 * lam, 0.75);
        float haze = 1.0 - exp(-length(p) / u_hazeDist);
        material.diffuse = mix(col * shade, vec3(0.88, 0.62, 0.44), haze * 0.55);
      }
    `,
  });
}

export type Preset = "light" | "balanced" | "presentation";

/**
 * Quality presets measured on a GTX 1050 Ti at 1600×900 (pure render, no streaming):
 *  light ~3.5 ms/frame · balanced ~10 ms · presentation ~18 ms
 * Measure again on the presentation machine with the tab visible.
 */
export function applyPreset(
  viewer: Cesium.Viewer,
  tilesets: Cesium.Cesium3DTileset[],
  preset: Preset,
  sunWC: Cesium.Cartesian3,
) {
  const scene = viewer.scene;

  // Directional light = sun (used by shadows).
  scene.light = new Cesium.DirectionalLight({ direction: Cesium.Cartesian3.negate(sunWC, new Cesium.Cartesian3()) });

  // Shadow bias (avoids banding). _primitiveBias is a Cesium internal: check it when upgrading.
  const bias = (scene.shadowMap as any)._primitiveBias;
  if (bias) {
    bias.polygonOffsetFactor = 4.0;
    bias.polygonOffsetUnits = 8.0;
    bias.normalOffsetScale = 0.5;
    bias.depthBias = 0.002;
    bias.normalShadingSmooth = 0.3;
  }
  scene.shadowMap.darkness = 0.6;
  scene.shadowMap.softShadows = true;
  scene.shadowMap.maximumDistance = 8000;

  const sse = preset === "light" ? 16 : preset === "balanced" ? 6 : 4;
  for (const tileset of tilesets) {
    tileset.maximumScreenSpaceError = sse;
    tileset.shadows = preset === "light" ? Cesium.ShadowMode.DISABLED : Cesium.ShadowMode.ENABLED;
  }
  viewer.shadows = preset !== "light";
  scene.shadowMap.size = preset === "presentation" ? 4096 : 2048;
  scene.msaaSamples = preset === "light" ? 1 : 4;
}

export function applyAtmosphere(scene: Cesium.Scene) {
  const sky = scene.skyAtmosphere;
  if (sky) {
    sky.show = true;
    sky.atmosphereMieCoefficient = new Cesium.Cartesian3(9.0e-5, 2.0e-5, 1.0e-5);
    sky.atmosphereRayleighCoefficient = new Cesium.Cartesian3(9.0e-6, 2.0e-6, 1.0e-6);
    sky.atmosphereRayleighScaleHeight = 9000;
    sky.atmosphereMieScaleHeight = 2700.0;
    sky.perFragmentAtmosphere = true;
  }
  scene.backgroundColor = new Cesium.Color(0.78, 0.55, 0.4, 1.0);
}
