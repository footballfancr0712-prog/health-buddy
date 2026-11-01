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
| `android/keystore.properties` | 本机签名配置（**不入库**，见下方说明） |
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

## 签名密钥（不在仓库里）

密钥和密码都**不进版本库**，所以这个分支可以安全地推到远程仓库。

| 文件 | 在哪 | 是否入库 |
|---|---|---|
| `mobile-app/healthbuddy.jks` | 本机 | 否（`.gitignore` 已排除） |
| `mobile-app/android/keystore.properties` | 本机 | 否 |
| `mobile-app/android/keystore.properties.example` | 仓库 | 是（只有字段名，没有真实值） |

`app/build.gradle` 会读 `android/keystore.properties` 取签名信息；文件不存在时仍能构建 debug 包，release 包不签名（终端会打印警告）。

**重新拉仓库后要做的**：把 `keystore.properties.example` 复制成 `keystore.properties`，填入真实密码；并把 `healthbuddy.jks` 放回 `mobile-app/` 下。

**这个密钥必须自己另外备份**（网盘、手机、密码管理器都行）。它是唯一能让手机`覆盖升级`的东西：

- 丢了 → 只能卸载重装，手机里的记录清空
- 泄漏 → 别人能签一个同包名的假冒 APK，装进去就能读手机里的记录

## 已知限制

APK 内的数据存在 WebView 的 localStorage 里，不读电脑上那份 CSV，两边互不相通。
页面里的「导出 CSV」用浏览器下载方式实现，**安卓 WebView 默认不处理，点了可能没反应** —— 要文件级备份需要接 `@capacitor/filesystem` + `@capacitor/share` 改成原生保存/分享。
