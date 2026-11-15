# Synthetic directed-routing measurements

Observed on 2026-11-14 on this implementation machine. These are fresh runs, not earlier README estimates. Both inputs are fixtures; neither validates Mars movement or completes P2-06 real-parcel integration.

Runtime: Python 3.11.7 (Anaconda), NumPy 1.26.4, SciPy 1.11.4, Windows AMD64 (`Windows-10-10.0.26300-SP0`), eight logical CPUs. Commands were run from the repository root in separate fresh processes:

```powershell
& 'C:\Users\Usuario\anaconda3\python.exe' -m engine.routing_benchmark --rows 256 --cols 256 --block-cells 65536
& 'C:\Users\Usuario\anaconda3\python.exe' -m engine.routing_benchmark --rows 1500 --cols 1500 --block-cells 65536
```

Portable equivalent: use the chosen Python interpreter with the pinned `engine/requirements.txt` and the same `-m engine.routing_benchmark` arguments.

Input: 2 m square cells, `elevation_m = 0.02 * row + 0.04 * column`, complete coverage, no exclusions, assumed 2-degree terrain summaries. Team: `explorer_01` plus `transport_rover`, zero payload, unchanged synthetic defaults. Base `(0,0)`, destination at the opposite corner. Data version `synthetic-plane-benchmark-v1`; movement version `synthetic_constant_speed_v1`. Cell-center extent is 2998 x 2998 m for the larger grid. No network, browser, HTTP service or real parcel was loaded.

| Observation | 256 x 256 | 1500 x 1500 |
| --- | ---: | ---: |
| Nodes (all traversable) | 65,536 | 2,250,000 |
| Directed edges | 521,220 | 17,982,004 |
| Grid validation/snapshot time | 0.00150 s | 0.06839 s |
| Two-pass graph build | 0.16756 s | 4.61956 s |
| Outbound + transpose return searches | 0.04353 s | 2.22402 s |
| Two-leg reconstruction/scalar verification | 0.05426 s | 0.21752 s |
| Cells per returned leg | 256 | 1500 |
| Outbound synthetic duration | 1944.154727 s | 11428.580139 s |
| Return synthetic duration | 1990.285988 s | 11699.759594 s |

Exact retained array sizes in bytes:

| Storage | 256 x 256 | 1500 x 1500 |
| --- | ---: | ---: |
| Grid snapshots (elevation, masks, slope summary) | 1,179,648 | 40,500,000 |
| CSR values, indices and pointers | 6,516,788 | 224,784,052 |
| Traversability mask | 65,536 | 2,250,000 |
| Four source-limited search arrays | 1,572,864 | 54,000,000 |
| Retained arrays total | 9,334,836 | 321,534,052 |
| Construction workspace planning allowance | 17,039,360 | 25,777,216 |

The workspace allowance is `4 * nodes + 256 * min(block_cells, nodes)`; it is a conservative estimate for the cursor and blocked temporaries, not a measured peak. Retained arrays exclude Python objects, route explanations, original caller arrays and all temporary allocations. Grid validation copies inputs and can temporarily hold several grid-sized arrays. Construction retains exact CSR storage rather than a full COO intermediate or participant cube.

Measured **process high-water resident memory**, in bytes, using Windows `GetProcessMemoryInfo.PeakWorkingSetSize`:

| Checkpoint | 256 x 256 | 1500 x 1500 |
| --- | ---: | ---: |
| After imports | 46,211,072 | 46,145,536 |
| After grid validation | 49,328,128 | 152,162,304 |
| After graph build | 63,787,008 | 330,387,456 |
| After both searches | 66,252,800 | 718,815,232 |
| After reconstruction | 66,252,800 | 718,815,232 |

The larger run peaked at approximately **685.5 MiB**; retained numerical arrays total approximately **306.6 MiB**. These high-water values include runtime/imports, caller/snapshot overlap, SciPy transpose conversion, native Dijkstra scratch and allocator retention. Differences between checkpoints are not isolated allocation measurements; memory is not reset between stages. The benchmark also supports Unix process peak RSS through `resource.getrusage`, with platform-specific units normalized to bytes.

Each size was measured once; timings vary with system load and memory pressure. Both runs returned two found legs and verified original-graph arcs and physical duration sums. Select 2 m versus 4 m only after measuring the agreed real P3 package and complete integration. Source-limited search still visits all reachable nodes; no time limit or candidate truncation was applied.
