import { useState, useEffect } from 'react';

export default function GPUWarpVisualization() {
  const [running, setRunning] = useState(false);
  const [stepMode, setStepMode] = useState(false);
  const [step, setStep] = useState(0);
  const [grids, setGrids] = useState([]);
  const [smStatus, setSmStatus] = useState([]);
  const [availableSMs, setAvailableSMs] = useState(4);
  const [threadsPerBlock, setThreadsPerBlock] = useState(128);
  const [blocksPerGrid, setBlocksPerGrid] = useState([2, 3]); // [x, y] dimension
  const [numGrids, setNumGrids] = useState(2);
  const [currentKernel, setCurrentKernel] = useState(0);
  const [log, setLog] = useState([]);
  const [speed, setSpeed] = useState(1000);
  const [showThreadDetails, setShowThreadDetails] = useState(false);
  
  // Calculate warps per block based on thread count (always 32 threads per warp)
  const getWarpsPerBlock = (threadCount) => Math.ceil(threadCount / 32);
  
  // Reset simulation
  const resetSimulation = () => {
    setRunning(false);
    setStep(0);
    setCurrentKernel(0);
    
    const warpsPerBlock = getWarpsPerBlock(threadsPerBlock);
    
    // Initialize grids (each with blocks)
    const newGrids = Array(numGrids).fill().map((_, gridIdx) => {
      // Create blocks in a 2D grid
      const blocks = [];
      for (let y = 0; y < blocksPerGrid[1]; y++) {
        for (let x = 0; x < blocksPerGrid[0]; x++) {
          blocks.push({
            id: y * blocksPerGrid[0] + x,
            position: [x, y],
            threads: threadsPerBlock,
            warps: warpsPerBlock,
            warpsCompleted: 0,
            status: gridIdx === 0 ? 'waiting' : 'queued', // First grid starts waiting, others are queued
            sm: null,
            progress: 0,
            color: `hsl(${((y * blocksPerGrid[0] + x) * 30) % 360}, 70%, 60%)`
          });
        }
      }
      
      return {
        id: gridIdx,
        blocks: blocks,
        status: gridIdx === 0 ? 'active' : 'queued', // First grid starts active
        totalBlocks: blocksPerGrid[0] * blocksPerGrid[1],
        completedBlocks: 0
      };
    });
    
    // Initialize SMs
    const newSmStatus = Array(availableSMs).fill().map((_, idx) => ({
      id: idx,
      blocks: [], // Blocks currently assigned to this SM
      capacity: 8, // Max number of blocks per SM
      warpsRunning: 0,
      maxWarps: 32 // Max warps per SM
    }));
    
    setGrids(newGrids);
    setSmStatus(newSmStatus);
    setLog([`Simulation reset. ${numGrids} kernels with ${blocksPerGrid[0]}x${blocksPerGrid[1]} blocks each, each block with ${threadsPerBlock} threads (${warpsPerBlock} warps)`]);
  };
  
  // Assign blocks to SMs
  const assignBlocksToSMs = () => {
    // Don't assign if we've moved on to the next kernel
    if (currentKernel >= grids.length) return false;
    
    const newGrids = [...grids];
    const newSmStatus = [...smStatus];
    let assigned = false;
    
    const currentGrid = newGrids[currentKernel];
    
    // Only process blocks from the current active grid
    if (currentGrid.status !== 'active') return false;
    
    for (let i = 0; i < currentGrid.blocks.length; i++) {
      const block = currentGrid.blocks[i];
      if (block.status === 'waiting') {
        // Find an SM with available capacity
        for (let j = 0; j < newSmStatus.length; j++) {
          const sm = newSmStatus[j];
          if (sm.blocks.length < sm.capacity) {
            // Assign block to this SM
            block.status = 'running';
            block.sm = sm.id;
            sm.blocks.push({
              gridId: currentKernel,
              blockId: block.id
            });
            sm.warpsRunning += block.warps;
            
            assigned = true;
            setLog(prevLog => [...prevLog, `Grid ${currentKernel}, Block (${block.position[0]},${block.position[1]}) assigned to SM ${sm.id} (${block.warps} warps)`]);
            break;
          }
        }
        
        if (assigned) break; // Only assign one block per step for visual clarity
      }
    }
    
    setGrids(newGrids);
    setSmStatus(newSmStatus);
    return assigned;
  };
  
  // Process warps in running blocks
  const processWarps = () => {
    if (currentKernel >= grids.length) return false;
    
    const newGrids = [...grids];
    const newSmStatus = [...smStatus];
    let anyProgress = false;
    
    // Process each SM
    for (let i = 0; i < newSmStatus.length; i++) {
      const sm = newSmStatus[i];
      
      // Process one block in this SM
      if (sm.blocks.length > 0) {
        const blockInfo = sm.blocks[0]; // Process the first block
        const grid = newGrids[blockInfo.gridId];
        const block = grid.blocks[blockInfo.blockId];
        
        if (block && block.status === 'running') {
          // Process a warp in this block (1 warp = 32 threads)
          if (block.warpsCompleted < block.warps) {
            block.warpsCompleted += 1;
            block.progress = Math.floor((block.warpsCompleted / block.warps) * 100);
            anyProgress = true;
            
            setLog(prevLog => [...prevLog, `SM ${sm.id} completed a warp (32 threads) from Grid ${blockInfo.gridId}, Block (${block.position[0]},${block.position[1]}) (${block.warpsCompleted}/${block.warps} warps)`]);
            
            // Check if block is completed
            if (block.warpsCompleted >= block.warps) {
              block.status = 'completed';
              // Remove block from SM
              sm.blocks = sm.blocks.filter(b => !(b.gridId === blockInfo.gridId && b.blockId === blockInfo.blockId));
              sm.warpsRunning -= block.warps;
              grid.completedBlocks += 1;
              
              setLog(prevLog => [...prevLog, `Grid ${blockInfo.gridId}, Block (${block.position[0]},${block.position[1]}) completed execution on SM ${sm.id}`]);
              
              // Check if grid is completed
              if (grid.completedBlocks >= grid.totalBlocks) {
                grid.status = 'completed';
                setLog(prevLog => [...prevLog, `Grid ${blockInfo.gridId} (Kernel ${blockInfo.gridId}) completed execution`]);
                
                // Activate next grid if available
                if (blockInfo.gridId + 1 < newGrids.length) {
                  newGrids[blockInfo.gridId + 1].status = 'active';
                  // Set all blocks in next grid to waiting
                  newGrids[blockInfo.gridId + 1].blocks.forEach(b => {
                    b.status = 'waiting';
                  });
                  setCurrentKernel(blockInfo.gridId + 1);
                  setLog(prevLog => [...prevLog, `Grid ${blockInfo.gridId + 1} (Kernel ${blockInfo.gridId + 1}) activated`]);
                }
              }
            }
            
            break; // Only process one warp per SM per step for clarity
          }
        }
      }
    }
    
    setGrids(newGrids);
    setSmStatus(newSmStatus);
    return anyProgress;
  };
  
  // Run simulation step
  const runStep = () => {
    // Check if all grids completed
    if (grids.every(grid => grid.status === 'completed')) {
      setRunning(false);
      setLog(prevLog => [...prevLog, 'All kernels completed! Simulation finished.']);
      return;
    }
    
    const blockAssigned = assignBlocksToSMs();
    const warpsProcessed = processWarps();
    
    // If nothing happened in this step and simulation isn't done, something is wrong
    if (!blockAssigned && !warpsProcessed && currentKernel < grids.length && 
        grids[currentKernel].status === 'active' && 
        grids[currentKernel].blocks.some(b => b.status === 'waiting')) {
      setLog(prevLog => [...prevLog, 'Warning: No progress made. Possible resource deadlock.']);
    }
    
    setStep(prevStep => prevStep + 1);
  };
  
  // Effect for continuous running
  useEffect(() => {
    let intervalId;
    
    if (running && !stepMode) {
      intervalId = setInterval(() => {
        runStep();
      }, speed);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [running, stepMode, grids, smStatus, speed, currentKernel]);
  
  // Initialize on first load
  useEffect(() => {
    resetSimulation();
  }, []);
  
  // Generate thread structure display for a block
  const renderThreadBlock = (block) => {
    if (!showThreadDetails) return null;
    
    // Calculate dimensions based on thread count
    // For simplicity let's show a 2D layout
    const threadsPerRow = Math.min(8, Math.ceil(Math.sqrt(block.threads)));
    const rows = Math.ceil(block.threads / threadsPerRow);
    
    return (
      <div className="mt-2 border-t pt-2">
        <div className="text-xs font-medium mb-1">Thread Layout:</div>
        <div className="grid grid-cols-8 gap-1">
          {Array(block.threads).fill().map((_, idx) => {
            const warpIdx = Math.floor(idx / 32);
            const isCompleted = warpIdx < block.warpsCompleted;
            return (
              <div 
                key={idx}
                className={`w-3 h-3 rounded-sm ${isCompleted ? 'bg-green-500' : 'bg-gray-300'}`}
                title={`Thread ${idx} (Warp ${warpIdx})`}
              ></div>
            );
          })}
        </div>
        <div className="text-xs mt-1">
          {Math.ceil(block.threads / 32)} warps × 32 threads/warp
        </div>
      </div>
    );
  };
  
  // Calculate grid dimensions for display
  const gridDimensions = {
    width: blocksPerGrid[0] * 80 + 40,
    height: blocksPerGrid[1] * 80 + 40
  };
  
  return (
    <div className="flex flex-col p-4 bg-gray-100 rounded-lg shadow-md max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-4 text-center">NVIDIA CUDA GPU Execution Model</h1>
      
      {/* Controls */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <div className="flex flex-wrap gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium mb-1">Threads Per Block:</label>
            <select 
              className="border rounded p-2" 
              value={threadsPerBlock}
              onChange={(e) => setThreadsPerBlock(parseInt(e.target.value))}
              disabled={running}
            >
              <option value="32">32 threads (1 warp)</option>
              <option value="64">64 threads (2 warps)</option>
              <option value="96">96 threads (3 warps)</option>
              <option value="128">128 threads (4 warps)</option>
              <option value="256">256 threads (8 warps)</option>
              <option value="512">516 threads (16 warps)</option>
              <option value="1024">1024 threads (32 warps)</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Grid Size:</label>
            <div className="flex gap-2">
              <select 
                className="border rounded p-2" 
                value={blocksPerGrid[0]}
                onChange={(e) => setBlocksPerGrid([parseInt(e.target.value), blocksPerGrid[1]])}
                disabled={running}
              >
                <option value="1">1 block wide</option>
                <option value="2">2 blocks wide</option>
                <option value="3">3 blocks wide</option>
                <option value="4">4 blocks wide</option>
              </select>
              <span className="self-center">×</span>
              <select 
                className="border rounded p-2" 
                value={blocksPerGrid[1]}
                onChange={(e) => setBlocksPerGrid([blocksPerGrid[0], parseInt(e.target.value)])}
                disabled={running}
              >
                <option value="1">1 block high</option>
                <option value="2">2 blocks high</option>
                <option value="3">3 blocks high</option>
                <option value="4">4 blocks high</option>
              </select>
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Number of Kernels:</label>
            <select 
              className="border rounded p-2" 
              value={numGrids}
              onChange={(e) => setNumGrids(parseInt(e.target.value))}
              disabled={running}
            >
              <option value="1">1 kernel</option>
              <option value="2">2 kernels</option>
              <option value="3">3 kernels</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Number of SMs:</label>
            <select 
              className="border rounded p-2" 
              value={availableSMs}
              onChange={(e) => setAvailableSMs(parseInt(e.target.value))}
              disabled={running}
            >
              <option value="2">2 SMs</option>
              <option value="4">4 SMs</option>
              <option value="8">8 SMs</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Simulation Speed:</label>
            <select 
              className="border rounded p-2" 
              value={speed}
              onChange={(e) => setSpeed(parseInt(e.target.value))}
            >
              <option value="2000">Slow</option>
              <option value="1000">Normal</option>
              <option value="500">Fast</option>
              <option value="200">Very Fast</option>
            </select>
          </div>
        </div>
        
        <div className="flex gap-2 items-center">
          <button 
            className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded"
            onClick={() => {
              if (running) {
                setRunning(false);
              } else {
                setRunning(true);
                setStepMode(false);
              }
            }}
          >
            {running && !stepMode ? 'Pause' : 'Run'}
          </button>
          
          <button 
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded"
            onClick={() => {
              if (stepMode) {
                runStep();
              } else {
                setStepMode(true);
                setRunning(true);
              }
            }}
            disabled={running && !stepMode}
          >
            Step
          </button>
          
          <button 
            className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            onClick={resetSimulation}
          >
            Reset
          </button>
          
          <label className="ml-4 flex items-center">
            <input 
              type="checkbox" 
              checked={showThreadDetails} 
              onChange={() => setShowThreadDetails(!showThreadDetails)}
              className="mr-2"
            />
            <span className="text-sm">Show Thread Details</span>
          </label>
        </div>
      </div>
      
      {/* Host-Device Visualization */}
      <div className="flex gap-4 mb-4">
        {/* Host Side */}
        <div className="bg-blue-100 p-4 rounded-lg shadow w-1/4">
          <h2 className="text-lg font-semibold mb-2">Host</h2>
          <div className="flex flex-col gap-2">
            {Array(numGrids).fill().map((_, idx) => (
              <div 
                key={idx}
                className={`bg-green-200 p-2 rounded-lg ${currentKernel === idx ? 'border-2 border-green-600' : ''}`}
              >
                <div className="font-medium">Kernel {idx}</div>
                <div className="text-xs">
                  Status: {idx < currentKernel ? 'Completed' : idx === currentKernel ? 'Active' : 'Queued'}
                </div>
                <div className="text-xs">
                  Grid: {blocksPerGrid[0]}×{blocksPerGrid[1]} blocks
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Device Side */}
        <div className="bg-blue-100 p-4 rounded-lg shadow w-3/4">
          <h2 className="text-lg font-semibold mb-2">Device</h2>
          
          {/* Grids */}
          <div className="flex flex-col gap-4">
            {grids.map((grid, idx) => (
              <div 
                key={idx}
                className={`${
                  grid.status === 'active' ? 'bg-green-200' : 
                  grid.status === 'completed' ? 'bg-gray-200' : 'bg-yellow-100'
                } p-2 rounded-lg`}
                style={{
                  width: `${gridDimensions.width}px`,
                  minHeight: `${Math.min(200, gridDimensions.height)}px`,
                  opacity: grid.status === 'queued' ? 0.6 : 1
                }}
              >
                <div className="font-medium mb-2">Grid {idx} ({grid.status})</div>
                
                {/* Blocks in grid */}
                <div 
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${blocksPerGrid[0]}, 1fr)`,
                  }}
                >
                  {grid.blocks.map((block) => (
                    <div 
                      key={block.id}
                      className="p-2 rounded-lg"
                      style={{
                        backgroundColor: block.status === 'waiting' ? '#f3f4f6' : 
                                       block.status === 'running' ? block.color : 
                                       block.status === 'completed' ? '#a7f3d0' : '#f9fafb',
                        border: '1px solid #d1d5db'
                      }}
                    >
                      <div className="text-xs font-medium">
                        Block ({block.position[0]},{block.position[1]})
                      </div>
                      <div className="text-xs">
                        {block.threads} threads
                      </div>
                      <div className="text-xs">
                        {block.warps} warps
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                        <div 
                          className="bg-blue-600 rounded-full h-2" 
                          style={{ width: `${block.progress}%` }}
                        ></div>
                      </div>
                      <div className="text-xs mt-1">
                        {block.status}
                        {block.sm !== null && block.status === 'running' ? ` (SM ${block.sm})` : ''}
                      </div>
                      
                      {showThreadDetails && renderThreadBlock(block)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      
      {/* SMs */}
      <div className="bg-white p-4 rounded-lg shadow mb-4">
        <h2 className="text-lg font-semibold mb-2">Streaming Multiprocessors (SMs)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {smStatus.map(sm => (
            <div key={sm.id} className="border rounded-lg p-2">
              <div className="font-medium">SM {sm.id}</div>
              <div className="text-xs mb-1">
                Blocks: {sm.blocks.length}/{sm.capacity}
              </div>
              <div className="text-xs mb-1">
                Warps: {sm.warpsRunning}/{sm.maxWarps}
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {sm.blocks.map((blockInfo, idx) => {
                  const grid = grids[blockInfo.gridId];
                  const block = grid ? grid.blocks[blockInfo.blockId] : null;
                  return block ? (
                    <div 
                      key={idx}
                      className="text-xs px-2 py-1 rounded"
                      style={{ backgroundColor: block.color }}
                    >
                      G{blockInfo.gridId}:B({block.position[0]},{block.position[1]})
                      <div className="text-xs">
                        ({block.warpsCompleted}/{block.warps} warps)
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Execution Log */}
      <div className="bg-white p-4 rounded-lg shadow">
        <h2 className="text-lg font-semibold mb-2">Execution Log (Step: {step})</h2>
        <div className="h-32 overflow-y-auto border rounded p-2 bg-gray-50">
          {log.slice().reverse().map((entry, idx) => (
            <div key={idx} className="text-xs mb-1">{entry}</div>
          ))}
        </div>
      </div>
      
      {/* Explanation */}
      <div className="bg-white p-4 rounded-lg shadow mt-4">
        <h2 className="text-lg font-semibold mb-2">CUDA Execution Model</h2>
        <div className="text-sm">
          <p className="mb-2"><strong>Host vs Device:</strong> The CPU (host) launches kernels that execute on the GPU (device).</p>
          <p className="mb-2"><strong>Kernel:</strong> A function executed on the GPU. Each kernel launch creates a grid of thread blocks.</p>
          <p className="mb-2"><strong>Grid:</strong> A 1D, 2D, or 3D structure of thread blocks.</p>
          <p className="mb-2"><strong>Thread Block:</strong> A 1D, 2D, or 3D collection of threads that execute on a single SM. Threads in a block can synchronize and share memory.</p>
          <p className="mb-2"><strong>Warp:</strong> The basic execution unit in an NVIDIA GPU - exactly 32 threads that execute the same instruction simultaneously (SIMD).</p>
          <p className="mb-2"><strong>SM (Streaming Multiprocessor):</strong> Processing unit that executes warps. Multiple blocks can run concurrently on a single SM.</p>
          <p className="mb-2"><strong>Execution Flow:</strong> When a kernel is launched, blocks are distributed to SMs with available capacity. As blocks complete, new ones are assigned.</p>
          <p className="mb-2"><strong>Efficiency Tip:</strong> Keep thread block sizes as multiples of 32 (warp size) for optimal performance.</p>
        </div>
      </div>
    </div>
  );
}