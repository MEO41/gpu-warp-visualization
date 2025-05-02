# CUDA GPU Execution Model Simulator

This project simulates the execution of CUDA kernels on a GPU using a simplified model of thread blocks, grids, warps, and streaming multiprocessors (SMs). It's a helpful educational tool for visualizing how GPU computation works at the hardware scheduling level.

## 🔍 Overview

This simulator provides a real-time visual representation of:

- How **kernels** are launched from the host.
- How **thread blocks** are distributed across **Streaming Multiprocessors (SMs)**.
- How **threads** are grouped into **warps** and scheduled by **warp schedulers**.
- How **shared memory**, **registers**, and **execution units** are utilized in an SM.

![Simulator Screenshot](https://github.com/MEO41/gpu-warp-visualization/blob/main/readmeAssets/Screenshot%202025-05-02%20232616.png?raw=true)
> Kernel execution and thread block mapping onto SMs

## 📌 Features

- Adjustable parameters:
  - Threads per block (e.g., 128 threads = 4 warps)
  - Grid dimensions (X × Y)
  - Number of kernels and SMs
  - Simulation speed
- Visual mapping of:
  - Warps per block
  - SM resource sharing
  - Execution states (waiting, active, queued)
- Educational diagrams showing kernel-to-grid and grid-to-block relationships

## 🧠 Key CUDA Concepts Visualized

- **Kernels**: GPU functions launched by the CPU.
- **Grids**: Collections of blocks, each block assigned to an SM.
- **Blocks**: Groups of threads that share local memory and execute on the same SM.
- **Threads**: Smallest units of execution.
- **Warps**: Groups of 32 threads executed simultaneously by the SM.
- **SM (Streaming Multiprocessor)**: Hardware unit capable of executing many warps concurrently.

![SM Diagram](https://github.com/MEO41/gpu-warp-visualization/blob/main/readmeAssets/02-sm.png?raw=true)
> SM architecture showing warp schedulers, execution units, and memory

## 🧱 Example Configuration

- **Threads per Block**: 128 (4 warps)
- **Grid Size**: 4 × 4 (16 blocks)
- **Number of SMs**: 4
- **Kernels Launched**: 2 (1 active, 1 queued)

## 📊 Warp and SM Scheduling

Each SM can handle a limited number of warps concurrently (up to 64 on modern NVIDIA GPUs). The warp scheduler within each SM is responsible for distributing instructions across available warps.

![Grid and Block View](https://github.com/MEO41/gpu-warp-visualization/blob/main/readmeAssets/02-threadmapping.png?raw=true)
> Threads within a block and how multiple grids interact with SMs

https://nyu-cds.github.io/python-gpu/02-cuda/
