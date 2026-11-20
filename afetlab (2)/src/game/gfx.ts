import * as THREE from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js'

export type Quality = 'low' | 'medium' | 'high'

const SanitizeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); if (any(isnan(c))) c = vec4(0.0); c = clamp(c, vec4(0.0), vec4(32.0)); gl_FragColor = c; }',
}

const FinishShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, uTime: { value: 0 }, uVig: { value: 0.32 }, uGrain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uVig; uniform float uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.2, length(d) * 1.25);
      c.rgb *= mix(1.0 - uVig, 1.0, v);
      c.rgb += (h(vUv * 1000.0) - 0.5) * uGrain;
      gl_FragColor = c;
    }`,
}

export class Gfx {
  readonly renderer: THREE.WebGLRenderer
  private composer: EffectComposer | null = null
  private renderPass!: RenderPass
  private gtao: GTAOPass | null = null
  private bloom!: UnrealBloomPass
  private finish!: ShaderPass
  quality: Quality = 'medium'
  private w = 1
  private h = 1
  private pixelRatio = 1
  readonly software: boolean

  constructor(private readonly canvas: HTMLCanvasElement, private scene: THREE.Scene, private camera: THREE.PerspectiveCamera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.88
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap
    const gl = this.renderer.getContext()
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const name = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
    this.software = /swiftshader|llvmpipe|software/i.test(name)
  }

  setQuality(q: Quality, sun?: THREE.DirectionalLight): void {
    this.quality = q
    const dpr = window.devicePixelRatio || 1
    this.pixelRatio = q === 'high' ? Math.min(dpr, 1.75) : q === 'medium' ? Math.min(dpr, 1.25) : 1
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.shadowMap.enabled = q !== 'low'
    if (sun) { sun.castShadow = q !== 'low'; const size = q === 'high' ? 4096 : 2048; if (sun.shadow.mapSize.x !== size) { sun.shadow.mapSize.set(size, size); sun.shadow.map?.dispose(); sun.shadow.map = null } }
    this.buildComposer()
    this.resize(this.canvas.clientWidth || window.innerWidth, this.canvas.clientHeight || window.innerHeight)
  }

  private buildComposer(): void {
    this.composer?.dispose(); this.composer = null; this.gtao = null
    if (this.quality === 'low') return
    const target = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, samples: this.quality === 'high' ? 4 : 2 })
    const c = new EffectComposer(this.renderer, target)
    this.renderPass = new RenderPass(this.scene, this.camera); c.addPass(this.renderPass)
    if (this.quality === 'high') {
      this.gtao = new GTAOPass(this.scene, this.camera, this.w, this.h)
      this.gtao.output = GTAOPass.OUTPUT.Default
      this.gtao.updateGtaoMaterial({ radius: 0.5, distanceExponent: 1.4, thickness: 1.2, scale: 1.0, samples: 12, distanceFallOff: 1.0 })
      this.gtao.blendIntensity = 0.9
      c.addPass(this.gtao)
    }
    c.addPass(new ShaderPass(SanitizeShader))
    this.bloom = new UnrealBloomPass(new THREE.Vector2(this.w, this.h), 0.11, 0.45, 1.15)
    c.addPass(this.bloom)
    c.addPass(new OutputPass())
    this.finish = new ShaderPass(FinishShader); c.addPass(this.finish)
    this.composer = c
  }

  resize(w: number, h: number): void {
    this.w = Math.max(2, Math.floor(w)); this.h = Math.max(2, Math.floor(h))
    this.renderer.setSize(this.w, this.h, false)
    this.camera.aspect = this.w / this.h; this.camera.updateProjectionMatrix()
    if (this.composer) { this.composer.setPixelRatio(this.pixelRatio); this.composer.setSize(this.w, this.h) }
  }

  render(time: number): void {
    if (this.composer) {
      this.finish.uniforms.uTime.value = time % 10
      this.composer.render()
    } else this.renderer.render(this.scene, this.camera)
  }
}
