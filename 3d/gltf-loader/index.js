import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

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

function main({ isDebug, backgroundColor, backgroundOpacity, autoRotateSpeed } = {}) {
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
  return async function loadGLTF(url) {
    const loader = new GLTFLoader()
    try {
      const newGltf = await loader.loadAsync(url)
      if (gltf) {
        scene.remove(gltf.scene)
      }
      gltf = newGltf
      const model = gltf.scene
      scene.add(model)
      model.updateMatrixWorld()
      const box = new THREE.Box3().setFromObject(model)

      const center = box.getCenter(new THREE.Vector3())
      const size = box.getSize(new THREE.Vector3()).length()
      controls.maxDistance = size * 10
      camera.near = size / 100
      camera.far = size * 100
      camera.position.copy(center)
      camera.position.x += size / 2.0
      camera.position.y += size / 5.0
      camera.position.z += size / 2.0
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

function onUploadGLTF(resolve) {
  const fileInput = document.querySelector('input[type=file]')
  fileInput.addEventListener('change', ({ target }) => {
    const { files } = target
    readGLTFFile(files[0]).then(resolve)
  })
}

; (function onLongTouchUploadGLTF() {
  const element = document.body
  const fileInput = document.querySelector('input[type=file]')
  let longPressTimer = null
  element.addEventListener('touchstart', function (event) {
    longPressTimer = setTimeout(() => {
      fileInput.click()
    }, 1000)
  })
  element.addEventListener('touchend', function (event) {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  })
  element.addEventListener('touchcancel', function (event) {
    clearTimeout(longPressTimer)
  })
})()

function onDragDropGLTF(resolve) {
  const dropArea = document.body
  // 监听dragover事件，设置为可接收数据
  dropArea.addEventListener('dragover', function (e) {
    e.preventDefault()
    this.classList.add('hover')
  }, false)
  // 监听drop事件，处理文件
  dropArea.addEventListener('drop', function (e) {
    e.preventDefault()
    dropArea.classList.remove('hover')
    const file = e.dataTransfer.files?.[0] // 获取文件列表
    readGLTFFile(file).then(resolve)
  }, false)
}

function readGLTFFile(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/.*\.gl(b|tf)$/.test(file.name)) reject('Not gltf')
    const reader = new FileReader()
    reader.onloadend = () => {
      resolve(reader.result)
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
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
  return { isDebug, backgroundColor, backgroundOpacity, model, autoRotateSpeed }
}

const { model, ...args } = getSearchParams()
const loadGLTF = main(args)
loadGLTF(model ?? 'https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb')
onUploadGLTF(loadGLTF)
onDragDropGLTF(loadGLTF)
