const { contextBridge, ipcRenderer, webUtils } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('api', {
  getState: invoke('state:get'),
  saveSettings: invoke('settings:save'),
  importKey: invoke('settings:importKey'),
  saveItem: invoke('item:save'),
  deleteItem: invoke('item:delete'),
  pickFile: invoke('dialog:file'),
  pickFolder: invoke('dialog:folder'),
  connectAccount: invoke('account:connect'),
  removeAccount: invoke('account:remove'),
  setCountry: invoke('account:country'),
  rapidLogin: invoke('rapid:login'),
  fetchTags: invoke('tags:fetch'),
  startUpload: invoke('upload:start'),
  channelOverview: invoke('channel:overview'),
  channelTemplates: invoke('channel:templates'),
  autoImage: invoke('images:auto'),
  searchImages: invoke('images:search'),
  downloadImage: invoke('images:download'),
  videoStats: invoke('video:stats'),
  videoComments: invoke('video:comments'),
  replyToComment: invoke('video:reply'),
  openVideo: invoke('open:video'),
  openExternal: invoke('open:external'),
  newId: invoke('id:new'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  onUpload: (cb) => ipcRenderer.on('upload:event', (_e, payload) => cb(payload)),
});
