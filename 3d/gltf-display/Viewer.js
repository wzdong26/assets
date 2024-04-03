
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  LoadingManager,
  REVISION,
  Box3,
  Vector3,
  BoxHelper,
  AnimationMixer,
} from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'

/**
 * @typedef {{fov: number, near: number, far: number}} PerspectiveCameraOptions
 * @typedef {import('three').WebGLRendererParameters} WebGLRendererParameters
 * @typedef {import('three').ColorRepresentation} ColorRepresentation
 * @typedef {import('three/examples/jsm/loaders/GLTFLoader.js').GLTF} GLTF
 */

const GLTF_LOADER = initGLTFLoader()

export class Viewer {
  /** @property {Scene} */
  scene
  /** @property {PerspectiveCamera} */
  camera
  /** @property {WebGLRenderer} */
  renderer
  /** @type {OrbitControls} */
  controls
  /** @type {import('three').Light} */
  light
  /** @type {GLTF} */
  gltf

  /** @param {{camera: PerspectiveCameraOptions; renderer: WebGLRendererParameters}} */
  constructor({ camera: { fov, near, far } = {}, renderer = {} } = {}) {
    this.scene = new Scene()
    this.camera = new PerspectiveCamera(fov ?? 75, 2, near ?? 0.1, far ?? 10000)
    this.renderer = new WebGLRenderer({ ...renderer, antialias: true, alpha: true })
    this.canvas = this.renderer.domElement
    this.controls = new OrbitControls(this.camera, this.canvas)
    this.controls.addEventListener('change', this.render.bind(this))
    window?.addEventListener('resize', this.render.bind(this))
    this.light = new AmbientLight()
    this.scene.add(this.light)
    GLTF_LOADER.ktx2LoaderDetectSupport(this.renderer)
  }
  /** @private @type {number} */
  _prevRenderTime
  render = rafDebounce((time) => {
    const delta = (time - this._prevRenderTime) / 1000
    this._resizeToDisplaySize()
    this.controls.update()
    this._mixer && this._mixer.update(delta)
    this.renderer.render(this.scene, this.camera)
    this._prevRenderTime = time
    this._renderedCb?.()
  })
  /** @private @type {() => void} */
  _renderedCb
  /** @param {() => void} cb*/
  onRendered(cb) {
    this._renderedCb = cb
    return () => {
      this._renderedCb = null
    }
  }
  /**@private */
  _resizeToDisplaySize() {
    const { width, clientWidth, height, clientHeight } = this.canvas
    const needResize = clientWidth !== width || clientHeight !== height
    if (needResize) {
      this.renderer.setSize(clientWidth, clientHeight, false)
      this.camera.aspect = clientWidth / clientHeight
      this.camera.updateProjectionMatrix()
    }
    return needResize
  }
  /**
   * @param {ColorRepresentation} color 
   * @param {number} alpha 
   */
  setBgColor(color, alpha) {
    this.renderer.setClearColor(color, alpha)
    this.render()
  }
  /** @param {number} speed */
  autoRotate(speed) {
    this.controls.autoRotate = !!speed
    this.controls.autoRotateSpeed = speed
    this.render()
  }
  /** @param {boolean} enabled */
  enableCtrl(enabled) {
    this.controls.enabled = enabled
    this.render()
  }
  /** @param {{color: ColorRepresentation; intensity: number}} */
  setLight({ color, intensity } = {}) {
    color != null && (this.light.color.set(color))
    intensity != null && (this.light.intensity = intensity)
    this.render()
  }
  /**
   * @param {string} url 
   * @param {Record<string, Blob>} blobs 
   */
  async loadGLTF(url, blobs) {
    this.unloadGLTF()
    this.gltf = await GLTF_LOADER.load(url, blobs)
    this.scene.add(this.gltf.scene)

    this.gltfAlignCenter(this._alignCenterParams)
    this._wireFrame && this.gltfWireFrame(this._wireFrame)
    this._boxHelper?.setFromObject(this.gltf.scene)

    this.render()
    return this.gltf
  }
  unloadGLTF() {
    this.mixer()?.destroy()
    const { gltf } = this
    gltf && this.scene.remove(gltf.scene)
    this.gltf = null
    this.render()
    return !gltf
  }
  /** @typedef {{zoom: number; alpha: number}} AlignCenterParams */
  /** @private @type {AlignCenterParams} */
  _alignCenterParams = {}
  /** @param {AlignCenterParams} */
  gltfAlignCenter({ zoom, alpha } = {}) {
    this._alignCenterParams = { zoom, alpha }
    if (!this.gltf) return false
    const model = this.gltf.scene
    model.updateMatrixWorld() // important! 更新模型的世界矩阵
    const box = new Box3().setFromObject(model)
    const center = box.getCenter(new Vector3())
    const size = box.getSize(new Vector3()).length()
    this.controls.maxDistance = size * 10
    this.controls.minDistance = size / 100
    this.camera.near = size / 100
    this.camera.far = size * 100
    this.camera.position.copy(center)
    this.camera.position.x += size / (zoom ?? 2.0)
    this.camera.position.y += size / (alpha ?? 5.0)
    this.camera.position.z += size / (zoom ?? 2.0)
    this.camera.updateProjectionMatrix() // important! 更新相机的投影矩阵
    this.controls.target = center
    this.render()
  }
  /** @private @type {boolean} */
  _wireFrame
  /** @param {boolean} wireframe */
  gltfWireFrame(wireframe) {
    this._wireFrame = wireframe
    if (!this.gltf) return false
    const model = this.gltf.scene
    model.traverse((node) => {
      if (!node.geometry) return
      const materials = Array.isArray(node.material) ? node.material : [node.material]
      materials.forEach((material) => {
        material.wireframe = wireframe
      })
    })
    this.render()
  }
  /** @private @type {BoxHelper} */
  _boxHelper
  /** @param {ColorRepresentation} color */
  gltfBoxHelper(color) {
    if (color == null && this._boxHelper) return this._boxHelper
    this._boxHelper = new BoxHelper(this.gltf?.scene, color)
    this.scene.add(this._boxHelper)
    const dispose = this._boxHelper.dispose.bind(this._boxHelper)
    this.render()
    return Object.assign(this._boxHelper, {
      dispose: () => {
        this.scene.remove(this._boxHelper)
        dispose()
        this._boxHelper = null
        this.render()
      }
    })
  }
  /** @private @type {AnimationMixer & {destroy: () => void}} */
  _mixer
  mixer() {
    if (this._mixer) return this._mixer
    if (!this.gltf) return
    const { animations, scene } = this.gltf
    if (!animations?.length) return
    this._mixer = new AnimationMixer(scene)
    const animationFrame = setInterval(this.render.bind(this))
    return Object.assign(this._mixer, {
      destroy: () => {
        clearInterval(animationFrame)
        this._mixer.stopAllAction()
        this._mixer.uncacheRoot(this._mixer.getRoot())
        this._mixer = null
      }
    })
  }
  /** @private @type {number} */
  _animateTimer
  gltfAnimate(name, cleanup) {
    if (!this.gltf) return false
    const { animations } = this.gltf
    const clip = animations.find(({ name: _n }) => name === _n)
    if (!clip) return false
    if (cleanup) {
      this.mixer()?.uncacheAction(clip)
    } else {
      const action = this.mixer()?.clipAction(clip)
      action?.reset().play()
    }
  }
  gltfAnimateCleanup() {
    this._lastAction?.fadeOut(dur)
    clearInterval(this._animateTimer)
  }
}

/**
 * initGLTFLoader: 创建 glTF Loader
 * @param {{renderer: WebGLRenderer; threePath: string}} param
 * @returns 
 */
function initGLTFLoader({
  renderer,
  threePath = `https://unpkg.com/three@0.${REVISION}.x`
} = {}) {
  const manager = new LoadingManager()
  const dracoLoader = new DRACOLoader(manager).setDecoderPath(
    `${threePath}/examples/jsm/libs/draco/gltf/`,
  )
  const ktx2Loader = new KTX2Loader(manager).setTranscoderPath(
    `${threePath}/examples/jsm/libs/basis/`,
  )
  /** @param {WebGLRenderer} renderer */
  function ktx2LoaderDetectSupport(renderer) {
    ktx2Loader.detectSupport(renderer)
  }
  renderer && ktx2LoaderDetectSupport(renderer)
  const loader = new GLTFLoader(manager)
    .setDRACOLoader(dracoLoader)
    .setKTX2Loader(ktx2Loader)
    .setMeshoptDecoder(MeshoptDecoder)
  return Object.assign(manager, {
    ktx2LoaderDetectSupport,
    /**
     * @param {string} gltfUrl 
     * @param {Record<string, Blob>} blobs 
     */
    async load(gltfUrl, blobs) {
      const objectURLs = []
      manager.setURLModifier((url) => {
        const blob = blobs?.[url]
        if (blob) {
          url = URL.createObjectURL(blob)
        }
        objectURLs.push(url)
        return url
      })
      const gltf = await loader.loadAsync(gltfUrl)
      objectURLs.forEach((url) => URL.revokeObjectURL(url))
      return gltf
    }
  })
}

/**
 * requestAnimationFrame debounce: 在一个动画帧内的频繁事件仅在下一次重绘前执行一次
 * @param {(time: number) => void} cb 触发事件执行的回调
 * @returns 防抖后的回调
 */
function rafDebounce(cb) {
  let flag = false
  return function () {
    if (!flag) {
      flag = true
      requestAnimationFrame((time) => {
        flag = false
        cb?.(time)
      })
    }
  }
}
