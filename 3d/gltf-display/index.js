import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { parseDataTransferItems } from './readFiles.js'

const { model, inputBlocked, ...args } = getSearchParams()
const loadGLTF = initViewer(args)

const setLoading = model != './loading/scene.gltf' ? createIframeLoading() : null

{
  if (model) {
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
}

// inputBlocked==false or model==null, 可上传gltf
if (!(inputBlocked && model)) {
  onUploadGLTF((...args) =>
    loadGLTF(...args).finally(() => {
      document.body.classList.remove('hover')
    })
    , console.error)
  onDragDropGLTF(loadGLTF, console.error)
}

// =================== THREE Viewer ===================
function initViewer({ debug, backgroundColor, backgroundOpacity, autoRotateSpeed, z, ctrlBlocked, lightColor, lightIntensity, wireframe } = {}) {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(75, 2, 0.1, 10000)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  typeof backgroundColor == 'number' && renderer.setClearColor(backgroundColor, backgroundOpacity)
  const canvas = renderer.domElement

  document.body.appendChild(canvas)
  const controls = new OrbitControls(camera, canvas)
  controls.enabled = !ctrlBlocked
  if (autoRotateSpeed) {
    controls.autoRotate = true
    controls.autoRotateSpeed = autoRotateSpeed
  }

  // 创建光照，例如环境光
  const ambientLight = new THREE.AmbientLight(lightColor, lightIntensity) // soft white light
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
    const newGltf = await loader.load(url, blobs)
    if (gltf) {
      scene.remove(gltf.scene)
    }
    gltf = newGltf
    const model = gltf.scene
    wireframe && traverseMaterials(model, (material) => {
      material.wireframe = true
    })
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
    if (debug) {
      const boxHelper = new THREE.BoxHelper(model, 0x00ff00)
      boxHelper.update()
      scene.add(boxHelper)
    }
    render()
  }
}

function traverseMaterials(object, callback) {
  object.traverse((node) => {
    if (!node.geometry) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach(callback);
  });
}

// =================== gltf load manager ===================
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

// =================== loading ===================
function createIframeLoading() {
  const iframeT = document.createElement('iframe')
  iframeT.src = './?model=./loading/scene.gltf&autoRotateSpeed=30&bgColor=e0dfdf,0.85&z=0.35&inputBlocked&ctrlBlocked'
  iframeT.className = 'loading'
  iframeT.hidden = true
  document.body.appendChild(iframeT)
  return function setLoading(flag) {
    iframeT.hidden = !flag
  }
}

// =================== searchParams input ===================
function getSearchParams() {
  const { href } = location
  const { searchParams } = new URL(href)
  const searchP = Object.fromEntries(searchParams.entries())
    // inputBlocked: 只可查看model，不可input gltf
    // ctrlBlocked: controls不可交互
    // debug: 可查看gltf box
    // wireframe: 可查看gltf wireframe
    ;['inputBlocked', 'ctrlBlocked', 'debug', 'wireframe'].forEach((e) => {
      if (searchP[e] != null) {
        searchP[e] = true
      }
    })

  searchP.autoRotateSpeed = str2Num(searchP.autoRotateSpeed, [0])
  searchP.z = str2Num(searchP.z, [1e-4])

  const [backgroundColorStr, backgroundOpacityStr] = searchP.bgColor?.split(/[,，]/) || []
  const [backgroundColor, backgroundOpacity] = [str2Color(backgroundColorStr), str2Num(backgroundOpacityStr, [0, 1])]

  const [lightColorStr, lightIntensityStr] = searchP.light?.split(/[,，]/) || []
  const [lightColor, lightIntensity] = [str2Color(lightColorStr), str2Num(lightIntensityStr, [0], Boolean)]

  return { ...searchP, backgroundColor, backgroundOpacity, lightColor, lightIntensity }
}

// ================== gltf input ===================
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

// =================== render utils ===================
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

// =================== common utils ===================
/**
 * 'fff' / 'ffffff' -> 0xffffff
 * @param {string} str 长度 3 or 6 的hex颜色字符串
 * @returns color 16进制hex色彩值
 */
function str2Color(str) {
  if (str?.length === 3) {
    str = [...str].map(e => e.repeat(2)).join('')
  }
  let color
  if (str?.length === 6) {
    color = parseInt(str, 16)
    if (Number.isNaN(color)) {
      color = undefined
    }
  }
  return color
}

/**
 * 字符串转数字: 非法字符串返回 undefined
 * @param {string} str 
 * @param {[min: number, max: number]} minmax 
 * @param {(str: string, num: string) => boolean} condition 
 * @returns 
 */
function str2Num(str, [min, max] = [], condition) {
  let num = +str
  const z = !Number.isNaN(num) &&
    num <= (max ?? num) &&
    num >= (min ?? num) &&
    !condition || condition?.(str, num)
  if (z)
    return num
}