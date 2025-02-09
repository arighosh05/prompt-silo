<p align="center">
  <img src="./obsidian_logo.png" alt="logo" width="100">
</p>

<p align="center">
  <b>Prompt Silo</b>
</p>

<p align="center">
  a private prompt management system for Obsidian
</p>

<p align="center">
  <a href="https://opensource.org/license/0bsd">
    <img src="https://img.shields.io/badge/License-0BSD-purple.svg" alt="License: 0BSD">
  </a>
</p>

## About

## Installation

### Prerequisites

To install this plugin, you'll need:

- [Git](https://git-scm.com/) installed on your local machine.
- A local development environment for [Node.js](https://nodejs.org/).

### Step 1 : Download the Plugin

First, you'll have to download the plugin to the `plugins` directory in your vault's `.obsidian` directory so that Obsidian can find it.

1. Open a terminal window and change the project directory to the `plugins` directory.

```
cd path/to/vault
mkdir .obsidian/plugins
cd .obsidian/plugins
```

2. Clone the plugin using `Git`.

```
git clone https://github.com/arighosh05/prompt-silo.git
```

### Step 2 : Build the Plugin

Next, we'll need to compile the plugin so that Obsidian can load it.

1. Navigate to the plugin directory.

```
cd prompt-silo
```

2. Install dependencies.

```
npm install
```

3. Compile the source code.

```
npm run build
```

### Step 3 : Enable the Plugin

Finally, you'll need to enable the plugin to use it in Obsidian.

1. In Obsidian, open Settings.
2. In the side menu, select Community plugins.
3. Select Turn on community plugins.
4. Under Installed plugins, enable Prompt Silo by selecting the toggle button next to it.

## Usage Example

## Meta

Aritra Ghosh – aritraghosh543@gmail.com

Distributed under the 0BSD license. See `LICENSE` for more information.

[https://github.com/arighosh05/](https://github.com/arighosh05/)

## Contributing

1. Fork it (<https://github.com/arighosh05/prompt-silo/fork>)
2. Create your feature branch (`git checkout -b feature/fooBar`)
3. Commit your changes (`git commit -am 'Add some fooBar'`)
4. Push to the branch (`git push origin feature/fooBar`)
5. Create a new Pull Request
