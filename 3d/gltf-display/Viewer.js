
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  AmbientLight,
  LoadingManager,
  REVISION,
  Box3,
  Vector3,
  BoxHelper
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

  /** @param {{camera: PerspectiveCameraOptions; renderer: WebGLRendererParameters}} param */
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
  render = rafDebounce(() => {
    this._resizeToDisplaySize()
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  })
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
  /**
   * @param {{color: ColorRepresentation; intensity: number}} color 
   */
  setLight({ color, intensity } = {}) {
    color != null && (this.light.color.set(color))
    intensity != null && (this.light.intensity = intensity)
    this.render()
  }
  /** @type {GLTF} */
  gltf
  /**
   * @param {string} url 
   * @param {Record<string, Blob>} blobs 
   */
  async loadGLTF(url, blobs) {
    const gltf = await GLTF_LOADER.load(url, blobs)
    this.gltf = gltf
    this.scene.add(gltf.scene)
    this.gltfAlignCenter()
    this.render()
    return gltf
  }
  unloadGLTF() {
    const { gltf } = this
    gltf && this.scene.remove(gltf.scene)
    this.gltfBoxHelper()
    this.gltf = null
    this.render()
    return !gltf
  }
  /** @param {boolean} wireframe */
  gltfWireFrame(wireframe) {
    if (!this.gltf) return false
    const model = this.gltf.scene
    model.traverse((node) => {
      if (!node.geometry) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      materials.forEach((material) => {
        material.wireframe = wireframe
      });
    })
    this.render()
  }
  /** @param {number} z */
  gltfAlignCenter(z) {
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
    this.camera.position.x += size / (z ?? 2.0)
    this.camera.position.y += size / 5.0
    this.camera.position.z += size / (z ?? 2.0)
    this.camera.updateProjectionMatrix() // important! 更新相机的投影矩阵
    this.controls.target = center
    this.render()
  }
  /** @type {BoxHelper} */
  boxHelper
  /** @param {ColorRepresentation} color */
  gltfBoxHelper(color) {
    if (!this.gltf) return false
    const { boxHelper } = this
    if (boxHelper) {
      this.scene.remove(this.boxHelper)
      this.boxHelper = null
    } else {
      const model = this.gltf.scene
      this.boxHelper = new BoxHelper(model, color)
      this.boxHelper.update()
      this.scene.add(this.boxHelper)
    }
    this.render()
    return !boxHelper
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
