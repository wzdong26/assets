import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { parseDataTransferItems } from './readFiles.js'

/**
 * 更新 renderer size 和 cameras aspect
 * @param {THREE.WebGLRenderer} renderer 
 * @param  {...THREE.PerspectiveCamera} cameras 
 * @returns 是否更新
 */
function resizeToDisplaySize(renderer, ...cameras) {
  const canvas = renderer.domElement
  const { width, clientWidth, height, clientHeight } = canvas
  const needResize = clientWidth !== width || clientHeight !== height
  if (needResize) {
    renderer.setSize(clientWidth, clientHeight, false)
    cameras.forEach(camera => {
      camera.aspect = clientWidth / clientHeight
      camera.updateProjectionMatrix()
    })
  }
  return needResize
}

/**
 * requestAnimationFrame debounce: 在一个动画帧内的频繁事件仅在下一次重绘前执行一次
 * @param {(time: number) => void} cb 触发事件执行的回调
 * @returns 防抖后的回调
 */
const rafDebounce = (cb) => {
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

function initViewer({ isDebug, backgroundColor, backgroundOpacity, autoRotateSpeed, z } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, 2, 0.1, 10000)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  typeof backgroundColor == 'number' && renderer.setClearColor(backgroundColor, backgroundOpacity)
  const canvas = renderer.domElement

  document.body.appendChild(canvas)
  const controls = new OrbitControls(camera, canvas)
  if (autoRotateSpeed) {
    controls.autoRotate = true
    controls.autoRotateSpeed = autoRotateSpeed
  }

  // 创建光照，例如环境光
  const ambientLight = new THREE.AmbientLight(0xffffff) // soft white light
  scene.add(ambientLight)

  const render = rafDebounce(() => {
    resizeToDisplaySize(renderer, camera)
    controls.update()
    renderer.render(scene, camera)
  })
  controls.addEventListener('change', render)
  window.addEventListener('resize', render)

  let gltf
  /**
   * @param {string} url
   * @param {Record<string, Blob>} blobs
   */
  return async function loadGLTF(url, blobs) {
    const loader = gltfLoader()
    try {
      const newGltf = await loader.load(url, blobs)
      if (gltf) {
        scene.remove(gltf.scene)
      }
      gltf = newGltf
      const model = gltf.scene
      scene.add(model)
      model.updateMatrixWorld() // important! 更新模型的世界矩阵
      const box = new THREE.Box3().setFromObject(model)

      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3()).length()
      controls.maxDistance = size * 10
      controls.minDistance = size / 100
      camera.near = size / 100
      camera.far = size * 100
      camera.position.copy(center)
      camera.position.x += size / (z ?? 2.0)
      camera.position.y += size / 5.0
      camera.position.z += size / (z ?? 2.0)
      camera.updateProjectionMatrix() // important! 更新相机的投影矩阵
      controls.target = center
      if (isDebug) {
        const boxHelper = new THREE.BoxHelper(model, 0x00ff00)
        boxHelper.update()
        scene.add(boxHelper)
      }
      render()
    } catch (e) {
      console.error('Load GLTF error:', e)
    }
  }
}

function gltfLoader() {
  const manager = new THREE.LoadingManager()
  manager.onStart = () => {
    setLoading?.(true)
  }
  manager.onLoad = () => {
    setLoading?.(false)
  }
  return Object.assign(manager, {
    /**
     * @param {string} gltfUrl 
     * @param {Record<string, Blob>} blobs 
     * @returns 
     */
    async load(gltfUrl, blobs) {
      const [, basePath, gltfName] = /(.*[\/\\])(.*)/.exec(gltfUrl) || []
      const objectURLs = []
      manager.setURLModifier((url) => {
        // const normalizedURL = basePath + decodeURI(url).replace(baseURL, '').replace(/^(\.?\/)/, '')
        const blob = blobs?.[url]
        if (blob) {
          url = URL.createObjectURL(blob)
        }
        objectURLs.push(url)
        return url
      })
      const loader = new GLTFLoader(manager)
      const gltf = await loader.loadAsync(gltfUrl)
      objectURLs.forEach((url) => URL.revokeObjectURL(url))
      return gltf
    }
  })
}

function onUploadGLTF(onLoad, onError) {
  const fileInput = document.querySelector('input[type=file]')
  fileInput.addEventListener('change', ({ target }) => {
    const { files } = target
    for (const file of files) {
      if (file.name.match(/\.gl(b|tf)$/)) {
        onLoad?.(file.name, { [file.name]: file })
        return
      }
    }
    onError?.('Not gltf')
  })
}

function onDragDropGLTF(onLoad, onError) {
  const dropArea = document.body
  dropArea.addEventListener('dragenter', () => {
    document.body.setAttribute('data-content-hover', '拖拽glTF文件放置此处（支持.gltf/.glb）')
    dropArea.classList.add('hover')
  })
  dropArea.addEventListener('dragover', (evt) => evt.preventDefault())
    ;['dragleave', 'drop'].forEach(e => {
      dropArea.addEventListener(e, (evt) => {
        evt.preventDefault()
        if (evt.target === dropArea) {
          dropArea.classList.remove('hover')
        }
      })
    })
  dropArea.addEventListener('drop', async ({ dataTransfer }) => {
    const { items } = dataTransfer || {} // 获取文件列表
    const files = await Promise.all(await parseDataTransferItems(items))
    const blobs = {}
    let gltfFile
    files.forEach(({ file, fullPath }) => {
      blobs[fullPath] = file
      if (fullPath.match(/\.gl(b|tf)$/)) {
        gltfFile = fullPath
      }
    })
    if (gltfFile) {
      onLoad?.(gltfFile, blobs)
    } else {
      onError?.('Not gltf')
    }
  }, false)
}

function getSearchParams() {
  const { href } = location
  const { searchParams } = new URL(href)
  const isDebug = searchParams.getAll('debug').length
  let [backgroundColorStr, backgroundOpacityStr] = searchParams.get('bgColor')?.split(/[,，]/) || []
  if (backgroundColorStr?.length === 3) {
    backgroundColorStr = backgroundColorStr.split('').map(e => e.repeat(2)).join('')
  }
  let backgroundColor
  if (backgroundColorStr?.length === 6) {
    backgroundColor = parseInt(backgroundColorStr, 16)
    if (Number.isNaN(backgroundColor)) {
      backgroundColor = undefined
    }
  }
  let backgroundOpacity = parseFloat(backgroundOpacityStr)
  if (Number.isNaN(backgroundOpacity)) {
    backgroundOpacity = undefined
  }
  const model = searchParams.get('model')
  const autoRotateSpeedStr = searchParams.get('autoRotateSpeed')
  let autoRotateSpeed = parseFloat(autoRotateSpeedStr)
  if (Number.isNaN(backgroundOpacity)) {
    autoRotateSpeed = undefined
  }
  const zStr = searchParams.get('z')
  let z = parseFloat(zStr)
  if (Number.isNaN(z)) {
    z = undefined
  }
  return { isDebug, backgroundColor, backgroundOpacity, model, autoRotateSpeed, z }
}

function createIframeLoading() {
  const iframeT = document.createElement('iframe')
  iframeT.src = './?model=./loading/scene.gltf&autoRotateSpeed=25&bgColor=e0dfdf,0.8&z=0.4'
  iframeT.className = 'loading'
  iframeT.hidden = true
  document.body.appendChild(iframeT)
  return function setLoading(flag) {
    iframeT.hidden = !flag
  }
}

const { model, ...args } = getSearchParams()
const loadGLTF = initViewer(args)

let setLoading
  ; (function init() {
    if (model) {
      if (model != './loading/scene.gltf') {
        setLoading = createIframeLoading()
      }
      loadGLTF(model)
    } else {
      document.body.setAttribute('data-content-hover', '点击上传glTF')
      document.body.classList.add('hover')
      const fileInput = document.querySelector('input[type=file]')
      document.addEventListener('click', ({ target }) => {
        if (target === document.body) {
          fileInput.click()
        }
      })
    }
  })()

onUploadGLTF((...args) =>
  loadGLTF(...args).finally(() => {
    document.body.classList.remove('hover')
  })
  , console.error)
onDragDropGLTF(loadGLTF, console.error)
