// The MIT License (MIT)
//
// Copyright (c) 2017 Mario Juez (mjuez@fi.upm.es), Gherardo Varando (gherardo.varando@gmail.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.

'use strict'

const isDev = require('electron-is-dev')
const storage = require('electron-json-storage')
const os = require('os')
const fs = require('fs')
const path = require('path')
const {
  GuiExtension,
  ToggleElement,
  Modal,
  Grid,
  FolderSelector,
  ButtonsContainer,
  input,
  util,
  Workspace
} = require('electrongui')
const {
  dialog,
  Menu,
  MenuItem,
  app
} = require('electron').remote
const {
  exec,
  spawn
} = require('child_process')
const {
  MapCreatorTask,
  ObjectDetectionTask,
  HolesDetectionTask,
  CropTask
} = require(path.join(__dirname, 'src', 'ImageJTasks'))
const ImageJUtil = require(path.join(__dirname, 'src', 'ImageJUtil'))
const request = require('request')

let plugins = {
  maptool: {
    filename: 'Map_tool-1.0.0.jar',
    url: 'http://github.com/ComputationalIntelligenceGroup/Map_tools/releases/download/v1.0.0/Map_tool-1.0.0.jar',
    name: ' Map_tool'
  },
  objcount: {
    name: 'ObjCounter',
    url: 'https://github.com/ComputationalIntelligenceGroup/ObjCounter/releases/download/v0.01/_ObjCounter-0.0.1-SNAPSHOT.jar',
    filename: '_ObjCounter-0.0.1.jar'
  },
  maxlogs: {
    name: 'MaxLoGs',
    url: 'https://github.com/ComputationalIntelligenceGroup/MaxLoGs/releases/download/v0.0.1/Max_LoGs-0.0.1-SNAPSHOT.jar',
    filename: 'Max_LoGs-0.0.1.jar'
  },
  stackjoin: {
    name: 'StackJoin',
    url: 'https://github.com/ComputationalIntelligenceGroup/stackJoin/releases/download/v0.0.1/StackJoin_-0.0.1-SNAPSHOT.jar',
    filename: 'StackJoin_-0.0.1.jar'
  }
}
/**
 * ImageJ extension.
 */
class ImageJExtension extends GuiExtension {

  /**
   * Creates an instance of the extension.
   * A menu with all capabilities is defined.
   */
  constructor(gui) {
    super(gui, {
      info: {
        author: 'Mario Juez (mjuez@fi.upm.es), Gherardo Varando (gherardo.varando@gmail.com)'
      },
      image: path.join(__dirname, "res", "img", "imagej-logo.gif"), //ok now
      menuLabel: 'ImageJ',
      menuTemplate: [{
        label: 'Launch ImageJ',
        click: () => {
          this.launchImageJ()
        }
      }, {
        label: 'Configure ImageJ',
        click: () => {
          this.configImageJ()
        }
      }, {
        label: 'Create TileLayer',
        submenu: [
          //   {
          //   label: "Create map from image",
          //   click: () => {
          //     this.createMap(true, false)
          //   }
          // }, {
          //   label: "Create map from folder",
          //   click: () => {
          //     this.createMap(true, true)
          //   }
          // },
          {
            label: "from image",
            click: () => {
              this.createMap(false, false)
            }
          }, {
            label: "from folder",
            click: () => {
              this.createMap(false, true)
            }
          }
        ]
      }, {
        label: 'Object Detection',
        submenu: [{
          label: "Single image",
          click: () => {
            this.objectDetection(ImageJUtil.LayersMode.SINGLE_IMAGE)
          }
        }, {
          label: "Folder",
          click: () => {
            this.objectDetection(ImageJUtil.LayersMode.FOLDER)
          }
        }, {
          label: "Image list",
          click: () => {
            this.objectDetection(ImageJUtil.LayersMode.IMAGE_LIST)
          }
        }]
      }, {
        label: 'Holes Detection',
        submenu: [{
          label: "Single image",
          click: () => {
            this.holesDetection(ImageJUtil.LayersMode.SINGLE_IMAGE)
          }
        }, {
          label: "Folder",
          click: () => {
            this.holesDetection(ImageJUtil.LayersMode.FOLDER)
          }
        }, {
          label: "Image list",
          click: () => {
            this.holesDetection(ImageJUtil.LayersMode.IMAGE_LIST)
          }
        }]
      }, {
        label: 'Tools',
        submenu: [{
          label: "Create Mosaic",
          click: () => {
            this.cropImage()
          }
        }]
      }]
    })
    if (isDev) {
      this._macrosPath = path.join(__dirname, 'macros')
    } else {
      this._macrosPath = path.join(process.resourcesPath, 'macros')
    }
    this.maxMemory = parseInt((os.totalmem() * 0.7) / 1000000)
    this.maxStackMemory = 515
    this.image = path.join(__dirname, "res", "img", "imagej-logo.gif")
    this._configuration = {
      memory: this.maxMemory,
      stackMemory: this.maxStackMemory
    }
  }

  /**
   * Activates the extension.
   */
  activate() {
    this.pane = new ToggleElement(document.createElement('DIV'))
    this.pane.element.className = 'pane'
    this.pane.show()
    this.element.appendChild(this.pane.element)
    this.appendMenu()
    storage.get('imagej-configuration', (error, data) => {
      if (error) return
      if (data) {
        this._configuration.path = (typeof data.path == 'string') ? data.path : undefined
        this._configuration.memory = (data.memory > 0) ? data.memory : this.maxMemory
        this._configuration.stackMemory = (data.stackMemory > 0) ? data.stackMemory : this.maxStackMemory
      }
      if (!(typeof this._configuration.path === 'string')) {
        dialog.showMessageBox({
          type: 'info',
          title: 'ImageJ need to be configured',
          message: 'The ImageJ seems not to be linked to the application, please ensure to have imageJ installed in your computer and configure it',
          buttons: ['Now', 'Later'],
          cancelId: 1
        }, (id) => {
          if (id == 1) return
          this.configImageJ()
        })
      }
    })
    super.activate()
  }

  /**
   * Deactivates the extension.
   */
  deactivate() {
    this.removeMenu()
    this.element.removeChild(this.pane.element)
  }

  /**
   * Shows the extension.
   */
  show() {
    super.show()
  }

  /**
   * Launchs a ImageJ instance with configured memory parameters.
   */
  launchImageJ() {
    if (!this.checkImageJ()) {
      this.gui.alerts.add('You need to install ImageJ and configure the extension', 'warning')
      return
    }
    let childProcess = spawn('java', [`-Xmx${this._configuration.memory}m`, `-Xss${this._configuration.stackMemory}m`, `-jar`, `ij.jar`], {
      cwd: this._configuration.path,
      stdio: 'ignore'
    })

    let alert = this.gui.alerts.add('ImageJ open', 'warning')

    childProcess.on('error', (error) => {
      this.gui.alerts.add(`ImageJ exec error: ${error}`, 'error')
      alert.remove()
    })

    childProcess.on('close', (code) => {
      this.gui.alerts.add('ImageJ closed', 'success')
      alert.remove()
    })
  }

  /**
   * Runs an ImageJ macro stored inside Atlas folder located in ImageJ macros folder.
   * @param {string} macro Name of the macro to run.
   * @param {string} args Arguments needed by the macro.
   */
  run(macro, args) {
    if (!this.checkImageJ()) {
      this.gui.alerts.add('You need to install ImageJ and configure the extension', 'warning')
      return
    }
    return spawn('java', [`-Xmx${this._configuration.memory}m`, `-Xss${this._configuration.stackMemory}m`, `-jar`, `ij.jar`, `-batchpath`, path.join(this._macrosPath, `${macro}.ijm`), `${args}`], {
      cwd: this._configuration.path
    })
  }

  /**
   * Opens a dialog asking for a file or folder as source for creating a map or a layer.
   * @param {boolean} isMap If true, we want to create a map, otherwise we want a layer.
   * @param {boolean} isFolder If true, all files of the folder will be used, the user
   * has to choose the image in the left upper corner. Otherwise only selected image will
   * be used.
   */
  createMap(isMap, isFolder) {
    let title = 'Choose image'
    if (isFolder) {
      title += ' in the left-upper corner'
    }

    dialog.showOpenDialog({
      title: title,
      type: 'normal'
    }, (filepaths) => {
      if (filepaths) {
        let details
        if (isMap) {
          details = `Map: ${path.basename(filepaths[0])}`
        } else {
          details = `Layer: ${path.basename(filepaths[0])}`
        }
        let mapCreatorTask = new MapCreatorTask(details, isMap, isFolder, this)
        this.gui.taskManager.addTask(mapCreatorTask)
        mapCreatorTask.on('fail', (e) => {
          this.gui.alerts.add(`Map Creator Task failed, \n ${details} \n ${e.error}`, 'danger')
        })
        mapCreatorTask.on('success', () => {
          this.gui.alerts.add(`Map Creator Task completed, \n ${details}`, 'success')
        })
        mapCreatorTask.on('error', (e) => {
          this.gui.alerts.add(`Map Creator Task process error, \n ${details} \n ${e.error}`, 'danger')
        })
        mapCreatorTask.run(filepaths[0], (e) => this.gui.alerts.add(e))
      }
    })
  }

  /**
   * Opens a dialog asking for a file or folder as source for performing an
   * object detection task.
   * @param {ImageJUtil.LayersMode} mode Object detection mode, can be single image,
   * folder, or list of images.
   */
  objectDetection(mode) {
    let props = ['openFile']
    if (mode === ImageJUtil.LayersMode.FOLDER) {
      props = ['openDirectory']
    }
    dialog.showOpenDialog({
      title: 'Image object detection',
      type: 'normal',
      properties: props
    }, (filepaths) => {
      if (filepaths) {
        let details
        if (mode === ImageJUtil.LayersMode.FOLDER) {
          details = `Folder: ${path.basename(filepaths[0])}`
        } else {
          if (path.extname(filepaths[0]) === "txt") {
            details = `File: ${path.basename(filepaths[0])}`
          } else {
            details = `Image: ${path.basename(filepaths[0])}`
          }
        }
        let objectDetectionTask = new ObjectDetectionTask(details, mode, this)
        objectDetectionTask.on('fail', (e) => {
          this.gui.alerts.add(`Object Detection Task failed, \n ${details} \n ${e.error}`, 'danger')
        })
        objectDetectionTask.on('success', () => {
          this.gui.alerts.add(`Object Detection Task completed, \n ${details}`, 'success')
        })
        objectDetectionTask.on('error', (e) => {
          this.gui.alerts.add(`Object Detection Task process error, \n ${details} \n ${e.error}`, 'danger')
        })
        this.gui.taskManager.addTask(objectDetectionTask)
        objectDetectionTask.run(filepaths[0])
      }
    })
  }

  /**
   * Opens a dialog asking for a file or folder as source for performing a
   * holes detection task.
   * @param {ImageJUtil.LayersMode} mode Holes detection mode, can be single image,
   * folder, or list of images.
   */
  holesDetection(mode) {
    let props = ['openFile']
    if (mode === ImageJUtil.LayersMode.FOLDER) {
      props = ['openDirectory']
    }
    dialog.showOpenDialog({
      title: 'Holes detection',
      type: 'normal',
      properties: props
    }, (filepaths) => {
      if (filepaths) {
        let details
        if (mode === ImageJUtil.LayersMode.FOLDER) {
          details = `Folder: ${path.basename(filepaths[0])}`
        } else {
          if (path.extname(filepaths[0]) === "txt") {
            details = `File: ${path.basename(filepaths[0])}`
          } else {
            details = `Image: ${path.basename(filepaths[0])}`
          }
        }
        let holesDetectionTask = new HolesDetectionTask(details, mode, this)
        holesDetectionTask.on('fail', (e) => {
          this.gui.alerts.add(`Holes Detection Task failed, \n ${details} \n ${e.error}`, 'danger')
        })
        holesDetectionTask.on('success', () => {
          this.gui.alerts.add(`Holes Detection Task completed, \n ${details}`, 'success')
        })
        holesDetectionTask.on('error', (e) => {
          this.gui.alerts.add(`Holes Detection Task process error, \n ${details} \n ${e.error}`, 'danger')
        })
        this.gui.taskManager.addTask(holesDetectionTask)
        holesDetectionTask.run(filepaths[0])
      }
    })
  }

  /**
   * Opens a dialog asking for a file (image) to crop it into small parts.
   */
  cropImage() {
    dialog.showOpenDialog({
        title: 'Crop Big Image',
        type: 'normal',
        properties: ['openFile']
      },
      (filepaths) => {
        if (filepaths) {
          let details = `Image: ${path.basename(filepaths[0])}`
          let cropTask = new CropTask(details, this)
          cropTask.on('fail', (e) => {
            this.gui.alerts.add(`Crop Task failed, \n ${details} \n ${e.error}`, 'danger')
          })
          cropTask.on('success', () => {
            this.gui.alerts.add(`Crop Detection Task completed, \n ${details}`, 'success')
          })
          cropTask.on('error', (e) => {
            this.gui.alerts.add(`Crop Detection Task process error, \n ${details} \n ${e.error}`, 'danger')
          })
          this.gui.taskManager.addTask(cropTask)
          cropTask.run(filepaths[0])
        }

      }
    )
  }

  /**
   * check if the linked folder is a valid imagej installation, actually just check the ij.jar file
   * WE SHOULD ALSO CHECK IF JAVA IS INSTALLED IN THE SYSTEM
   * @return {[type]} [description]
   */
  checkImageJ() {
    if (!this._configuration.path) return false
    let files = fs.readdirSync(this._configuration.path)
    if (!files.includes('ij.jar')) return false
    return fs.statSync(path.join(this._configuration.path, 'ij.jar')).isFile()
  }

  _downloadAllPlugin(){
    Object.keys(plugins).map((p)=>{
      this.downloadPlugin(plugins[p].url,plugins[p].filename)
    })
  }

  /**
   * Check if there is the plugin folder otherwise create it, then pass the path to a callback
   * @param  {[type]} cl    callback, cl(dir)
   * @param  {[type]} errcl error callback
   */
  _pluginDir(cl, errcl) {
    if (!this.checkImageJ()) {
      if (typeof errcl === 'function') errcl()
      return
    }
    fs.readdir(this._configuration.path, (err, files) => {
      if (err) return
      if (files.includes('plugins')) {
        fs.stat(path.join(this._configuration.path, 'plugins'), (err1, stats) => {
          if (err1) return
          if (typeof cl === 'function' && stats.isDirectory()) cl(path.join(this._configuration.path, 'plugins'))
        })
      } else {
        fs.mkdir(path.join(this._configuration.path, 'plugins'), (err) => {
          if (err) return
          else if (typeof cl === 'function') cl(path.join(this._configuration.path, 'plugins'))
        })
      }
    })
  }

  downloadPlugin(url, name) {
    this._pluginDir((dir) => {
      let filepath = path.join(dir, name)
      let file = fs.createWriteStream(filepath)
      let alert = this.gui.alerts.add(`Downloading plugin ${name}...`, 'progress')
      request(url).pipe(file)
      file.on('finish', () => {
        alert.setBodyText('file downloaded')
        file.close(() => {
          alert.remove()
          this.gui.alerts.add(`Plugins installed in ImageJ \n reload ImageJ if it is open`, 'success')
        })
      })
    })

  }

  /**
   * Opens a modal window for ImageJ memory parameters modification.
   */
  configImageJ() {
    let body = util.div('cellcontainer')
    let mem = input.input({
      parent: body,
      label: 'Memory (MB)',
      className: 'simple form-control cell',
      value: this._configuration.memory,
      type: 'number',
      min: 100,
      max: this.maxMemory,
      step: 1,
      placeholder: 'memory'
    })
    let stmem = input.input({
      parent: body,
      label: 'Stack memory (MB)',
      className: 'simple form-control cell',
      value: this._configuration.stackMemory,
      type: 'number',
      min: 10,
      max: this.maxStackMemory,
      step: 1,
      placeholder: 'memory'
    })

    let pt = new FolderSelector('imagejpathselector', {
      text: "Choose ImageJ path",
      className: 'cell',
      label: this._configuration.path || 'path',
      value: this._configuration.path || '',
      icon: 'fa fa-external-link',
      title: 'Select the path to the ij.jar file of the local ImageJ installation'
    })

    body.appendChild(pt.element)
    let img = document.createElement('IMG')
    img.className = "cell"
    img.style.float = "right"
    img.src = this.image
    img.width = 233 //150
    img.height = 47 //30.26
    body.appendChild(img)
    new Modal({
      title: `ImageJ configuration`,
      width: '400px',
      height: 'auto',
      body: body,
      oncancel: () => {
        this._configuration.memory = mem.value
        this._configuration.stackMemory = stmem.value
        this._configuration.path = pt.getFolderRoute()
        storage.set('imagej-configuration', this._configuration, (err) => {
          if (err) this.gui.alerts.add('Error saving ImageJ options', 'warning')
          if (!this.checkImageJ()) this.gui.alerts.add('The selected folder does not contain an imagej installation', 'warning')
          else this.gui.alerts.add('ImageJ configured', 'success')
        })
      },
      onsubmit: () => {
        this._configuration.memory = mem.value
        this._configuration.stackMemory = stmem.value
        this._configuration.path = pt.getFolderRoute()
        storage.set('imagej-configuration', this._configuration, (err) => {
          if (err) this.gui.alerts.add('Error saving ImageJ options', 'warning')
          if (!this.checkImageJ()) this.gui.alerts.add('The selected folder does not contain an imagej installation', 'warning')
          else this.gui.alerts.add('ImageJ configured', 'success')
        })
      }
    }).show()
  }

}

module.exports = ImageJExtension
