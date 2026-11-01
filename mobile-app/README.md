# 健康 Buddy · 安卓版（android 分支）

这个分支只做一件事：把 `main` 分支上那份页面打包成安卓 App。
页面本身不在这里维护，改页面请回 `main` 分支。

## 分支关系

```
main      ← 页面 + 电脑版（Electron），日常都在这里改
  │
  └── android   ← 同一个页面 + 安卓工程（Capacitor）
```

两个分支共用根目录下的 `健康Buddy-7天身体管理工作台.html`。
**页面更新后，在本分支执行 `git merge main` 即可，不会冲突** —— 因为本分支从不改页面，只有 main 在改。

## 打包

```bash
./build-release.sh
```

脚本会依次做四件事：把最新页面复制到 `www/`、`cap sync` 同步进安卓工程、用 JDK 21 构建签名版、把 APK 复制到仓库根目录并带上版本号。

产物：`健康Buddy-安卓版-v<版本>.apk`

**版本号**在 `android/app/build.gradle` 里：`versionName`（显示用）和 `versionCode`（升级判定，每次发版必须递增，否则装不上）。

## 工程结构

| 路径 | 说明 |
|---|---|
| `capacitor.config.json` | 包名 `com.personal.healthbuddy`，webDir 指向 `www` |
| `android/app/src/main/res` | 图标（`make-icons.py` 生成，5 档尺寸 + 自适应前景） |
| `android/app/build.gradle` | 版本号、签名配置、SDK 版本 |
| `android/make-icons.py` | 图标生成脚本，心形算法与电脑版一致 |
| `healthbuddy.jks` | 签名密钥（见下方警告） |
| `www/` | 构建时生成，已被 gitignore |

`android/` 目录内自带 Capacitor 的 `.gitignore`，构建产物、Gradle 缓存、SDK 本地路径都不会入库。

## 需要本机具备

- **JDK 21**（Capacitor 8 硬要求，JDK 17 会报「无效的源发行版：21」）
- Android SDK：`platforms;android-36`、`build-tools;36.0.0`
- Node.js + npm

仓库内 `tools/` 目录（被 gitignore）放的就是这套工具链，约 2.9GB，删了下次打包需重下。

## 两个坑

1. **必须强制 IPv4**：本机 Java 默认优先 IPv6 会导致 `Network is unreachable`。
   `android/gradle.properties` 里已加 `systemProp.java.net.preferIPv4Stack=true`，别删。
2. **Maven 镜像**：`maven.aliyun.com`、`repo.huaweicloud.com` 在本网络环境不可达，用官方源 `google()` + `mavenCentral()`，直连反而正常。

## ⚠️ 签名密钥

`healthbuddy.jks` 已纳入本分支版本管理（密码在 `android/app/build.gradle`），这样不会丢。

- **丢了就再也无法覆盖安装**，只能卸载重装、数据清空
- 如果哪天要把仓库推到 GitHub 等公开远程，**必须先把它移出版本管理**，否则任何人都能用它签一个假冒你的包

## 已知限制

APK 内的数据存在 WebView 的 localStorage 里，不读电脑上那份 CSV，两边互不相通。
页面里的「导出 CSV」用浏览器下载方式实现，**安卓 WebView 默认不处理，点了可能没反应** —— 要文件级备份需要接 `@capacitor/filesystem` + `@capacitor/share` 改成原生保存/分享。
