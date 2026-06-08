const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const path = require('path');

module.exports = {
  packagerConfig: {
    icon: path.resolve(__dirname, 'src/assets/icon.ico'), // Electron Forge resolves extension automatically

    asar: {
      unpack: [
        "**/.vite/build/preload/**",
        "**/.vite/build/renderer/**",
        "**/{@serialport,serialport,bindings-cpp,modbus-serial}/**/*"
      ],
    },

    ignore: [
      /^\/\.git/,
      /^\/forge\.config\.js$/,
      /^\/vite\.(.+)\.config\.mjs$/,
    ],

    win32metadata: {
      CompanyName: 'Revive Medical Technologies',
      FileDescription: 'Desktop App',
      OriginalFileName: 'Catheter Trackability Testing Machine',
      ProductName: 'CTTM',
      InternalName: 'Catheter Trackability Testing Machine',
    },
  },ignore: [
    /^\/\.git/,
    /^\/forge\.config\.js$/,
    /^\/vite\.(.+)\.config\.mjs$/,
  ],
  win32metadata: {
    CompanyName: 'Revive Medical Technologies',
    FileDescription: 'Desktop App',
    OriginalFileName: 'Catheter Trackability Testing Machine',
    ProductName: 'CTTM',
    InternalName: 'Catheter Trackability Testing Machine',
  },

  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        certificateFile: './cert.pfx',
        certificatePassword: process.env.CERTIFICATE_PASSWORD,
        noMsi: true,
        setupShortcut: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {},
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {},
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: { enabled: true },
    },
    {
      name: '@electron-forge/plugin-vite',
      config: {
        // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
        // If you are familiar with Vite configuration, it will look really familiar.
        build: [
          {
            // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
            entry: 'src/main.js',
            config: 'vite.main.config.mjs',
            target: 'main',
            externals: [],
          },
          {
            entry: 'src/preload.js',
            config: 'vite.preload.config.mjs',
            target: 'preload',
          },
        ],
        renderer: [
          {
            name: 'main_window',
            config: 'vite.renderer.config.mjs',
            entryPoints: [
              {
                html: './index.html',
                js: './src/renderer.jsx',
                name: 'main_window',
                preload: { js: './src/preload.js' },
              },
            ],
          },
        ],
      },
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),

  ],
};
