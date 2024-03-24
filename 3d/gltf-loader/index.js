import * as THREE from 'three'
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'
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

function main({ isDebug, backgroundColor } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, 2, 0.1, 10000)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  typeof backgroundColor == 'number' && renderer.setClearColor(backgroundColor, 1.0)
  const canvas = renderer.domElement
  document.body.appendChild(canvas)
  const controls = new OrbitControls(camera, canvas)

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
    if (gltf) {
      scene.remove(gltf.scene)
    }
    const loader = new GLTFLoader()
    try {
      gltf = await loader.loadAsync(url)
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
    if (!files?.length) return
    const reader = new FileReader()
    reader.onloadend = () => {
      resolve(reader.result)
    }
    reader.onerror = console.error
    reader.readAsDataURL(files[0])
  })
}

const { href } = location
const { searchParams } = new URL(href)
const isDebug = searchParams.getAll('debug').length
let backgroundColor = parseInt(searchParams.get('bgColor'), 16)
backgroundColor = !Number.isNaN(backgroundColor) && backgroundColor
console.log(backgroundColor)
const loadGLTF = main({ isDebug, backgroundColor })
loadGLTF('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb')
onUploadGLTF((e) => {
  loadGLTF(e)
})