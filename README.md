# Cat Gatekeeper

Cat Gatekeeper 是一个轻量 Chrome 插件：当你在容易分心的网站上停留太久时，猫猫会接管屏幕，提醒你休息一下。

当前版本优先服务快速内容验证：没有后端、没有账号系统、没有上传流程，也不需要构建步骤。

## 功能

- 监控用户可配置的目标网站。
- 只在目标标签页可见且处于焦点状态时计时。
- 达到设定时间后显示全屏猫猫遮罩和休息倒计时。
- 支持编辑目标网站、触发时间、休息时间、开关状态和提示音。
- 所有设置都通过 `chrome.storage.local` 存在本地浏览器中。

## 本地安装

1. 打开 Chrome，访问 `chrome://extensions`。
2. 打开右上角的 `Developer mode`。
3. 点击 `Load unpacked`。
4. 选择当前项目目录：`cat_screen`。
5. 打开插件弹窗或设置页，调整目标网站和时间。

## 演示设置

如果要拍短视频，建议先使用：

- 触发时间：`0.1` 分钟。
- 休息时间：`0.1` 分钟。
- 目标网站：`bilibili.com`、`douyin.com` 或 `xiaohongshu.com`。

打开目标网站，并保持当前标签页处于焦点状态，约 6 秒后猫猫遮罩就会出现。

## 替换猫猫素材

插件会优先加载 `assets/cat.webm`，并使用 `assets/cat.svg` 作为封面和兜底素材。

为了获得更好的短视频效果，建议导出透明背景的 WebM 动画，并放到：

- `assets/cat.webm`

推荐素材规格：

- 时长 3 到 6 秒。
- 首尾动作适合循环播放。
- 透明背景。
- 高度 720p 或 1080p。
- 文件尽量控制在 8 MB 以内。

文件越小，插件加载越顺滑。

### 从剪映 MOV 转成 WebM

如果你从剪映导出了带 Alpha 的 `assets/cat.mov`，建议转成浏览器更稳定的透明 WebM：

```bash
ffmpeg -i assets/cat.mov -t 6 -vf "scale=-2:720,format=yuva420p" -an -c:v libvpx-vp9 -pix_fmt yuva420p -auto-alt-ref 0 -b:v 0 -crf 30 assets/cat.webm
```

参数含义：

- `-t 6`：只取前 6 秒，适合做循环动画。
- `scale=-2:720`：高度压到 720p，宽度自动保持比例。
- `-an`：去掉声音，避免浏览器自动播放限制。
- `libvpx-vp9` + `yuva420p`：导出支持透明通道的 WebM。

Windows 用户如果没有 `ffmpeg`，可以选择：

- 安装 FFmpeg：推荐用 `winget install Gyan.FFmpeg`，安装后重新打开终端再执行上面的命令。
- 使用图形化工具：例如 Shutter Encoder，选择 VP9 / WebM，并开启透明通道相关选项。
- 找一台 macOS / Linux 机器或在线转码工具临时转换一次，再把生成的 `cat.webm` 放进 `assets/`。

不建议直接播放 `.mov`。Chrome 对带 Alpha 的 MOV 编码兼容性不稳定，剪映常见导出的 `qtrle / argb` MOV 很可能无法在 `<video>` 中透明播放。即使文件在本地，几百 MB 的视频也会导致插件加载慢、内存占用高、首次弹出卡顿。当前插件默认只播放 `assets/cat.webm`，这是更稳的分享格式。

## 隐私

插件不会收集、上传或出售用户数据。设置只保存在本地浏览器中。更多说明见 `PRIVACY.md`。

## 打包分享

如果要分享可侧载版本，可以压缩以下文件和目录：

- `manifest.json`
- `src/`
- `assets/`
- `README.md`
- `PRIVACY.md`

用户解压后，可以在 `chrome://extensions` 中通过 `Load unpacked` 加载插件。
