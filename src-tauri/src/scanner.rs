use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU32, AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use std::collections::HashMap;
use tauri::Emitter;
use std::sync::Mutex;

// Global scan state for cancellation
static GLOBAL_SCAN_STATE: std::sync::OnceLock<Arc<Mutex<Option<Arc<AtomicBool>>>>> = std::sync::OnceLock::new();

// Global file cache for seeding scans
#[derive(Debug, Clone)]
struct CachedFile {
    path: PathBuf,
    size: u64,
}

static FILE_CACHE: std::sync::OnceLock<Arc<Mutex<Vec<CachedFile>>>> = std::sync::OnceLock::new();

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub size: u64,
    #[serde(rename = "isDir")]
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ScanProgress {
    pub current_path: String,
    pub items_processed: u32,
}

struct ScanState {
    items_processed: Arc<AtomicU32>,
    last_emit: Instant,
    emit_interval: Duration,
    is_cancelled: Arc<AtomicBool>,
}

impl ScanState {
    fn new() -> Self {
        Self {
            items_processed: Arc::new(AtomicU32::new(0)),
            last_emit: Instant::now(),
            emit_interval: Duration::from_millis(100),
            is_cancelled: Arc::new(AtomicBool::new(false)),
        }
    }
    
    fn is_cancelled(&self) -> bool {
        self.is_cancelled.load(Ordering::Relaxed)
    }
    
    #[allow(dead_code)]
    fn cancel(&self) {
        self.is_cancelled.store(true, Ordering::Relaxed);
    }
    
    fn should_emit(&mut self) -> bool {
        self.last_emit.elapsed() >= self.emit_interval
    }
    
    fn emit(&mut self, app_handle: &tauri::AppHandle, path: &str) {
        let count = self.items_processed.load(Ordering::Relaxed);
        let progress = ScanProgress {
            current_path: path.to_string(),
            items_processed: count,
        };
        let _ = app_handle.emit("scan-progress", &progress);
        self.last_emit = Instant::now();
    }
}

// Cancel any ongoing scans
#[tauri::command]
pub fn cancel_scan() {
    if let Some(global_state) = GLOBAL_SCAN_STATE.get() {
        if let Ok(guard) = global_state.lock() {
            if let Some(cancel_flag) = guard.as_ref() {
                cancel_flag.store(true, Ordering::Relaxed);
                println!("[CANCEL] Scan cancellation requested");
            }
        }
    }
}

// Add files to cache
fn add_files_to_cache(files: &HashMap<PathBuf, u64>) {
    let cache = FILE_CACHE.get_or_init(|| Arc::new(Mutex::new(Vec::new())));
    if let Ok(mut cache_guard) = cache.lock() {
        // Add new files to cache
        for (path, size) in files {
            cache_guard.push(CachedFile { 
                path: path.clone(), 
                size: *size 
            });
        }
        
        // Sort by size (largest first) and keep only top 1000
        cache_guard.sort_by(|a, b| b.size.cmp(&a.size));
        cache_guard.truncate(1000);
        
        println!("[CACHE] Updated cache with {} files", cache_guard.len());
    }
}

// Get cached files relevant to a directory
fn get_cached_files_for_directory(target_path: &Path) -> HashMap<PathBuf, u64> {
    let cache = FILE_CACHE.get_or_init(|| Arc::new(Mutex::new(Vec::new())));
    let mut relevant_files = HashMap::new();
    
    if let Ok(cache_guard) = cache.lock() {
        for cached_file in cache_guard.iter() {
            if cached_file.path.starts_with(target_path) {
                relevant_files.insert(cached_file.path.clone(), cached_file.size);
            }
        }
    }
    
    if !relevant_files.is_empty() {
        println!("[CACHE] Found {} cached files for directory: {}", 
            relevant_files.len(), target_path.display());
    }
    
    relevant_files
}

pub fn scan_directory(path: &Path, app_handle: &tauri::AppHandle) -> Result<FileNode, String> {
    let mut state = ScanState::new();
    
    // Register this scan's cancellation flag globally
    let global_state = GLOBAL_SCAN_STATE.get_or_init(|| Arc::new(Mutex::new(None)));
    {
        let mut guard = global_state.lock().unwrap();
        *guard = Some(state.is_cancelled.clone());
    }
    
    // For home directory or very large directories, use smart scanning
    let path_str = path.to_string_lossy();
    let home_path = std::env::var("HOME").unwrap_or_default();
    
    println!("[SCAN] Starting scan_directory for path: {}, Home: {}", path_str, home_path);
    
    // Always use smart scanning (mdfind-based) for all directories
    let scan_path = if path_str == "~" {
        Path::new(&home_path)
    } else {
        path
    };
    
    println!("[SCAN] Using smart scanning with mdfind for directory: {}", scan_path.display());
    let result = scan_directory_smart(scan_path, app_handle, &mut state);
    
    match &result {
        Ok(node) => {
            println!("[SCAN] Scan completed successfully");
            println!("[SCAN] Result: name={}, path={}, size={}, is_dir={}, children_count={}", 
                node.name, node.path, node.size, node.is_dir, 
                node.children.as_ref().map(|c| c.len()).unwrap_or(0));
        },
        Err(e) => {
            println!("[SCAN] Scan failed with error: {}", e);
        }
    }
    
    result
}

// Scans directory to a specific depth, calculating sizes for all subdirectories
#[allow(dead_code)]
fn scan_directory_shallow(
    path: &Path,
    app_handle: &tauri::AppHandle,
    state: &mut ScanState,
    current_depth: u32,
    target_depth: u32,
) -> Result<FileNode, String> {
    let metadata = fs::metadata(path)
        .map_err(|e| format!("Failed to read metadata: {}", e))?;
    
    let name = path.file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    
    state.items_processed.fetch_add(1, Ordering::Relaxed);
    
    if state.should_emit() {
        state.emit(app_handle, &path.to_string_lossy());
    }
    
    if metadata.is_file() {
        return Ok(FileNode {
            name,
            path: path.to_string_lossy().to_string(),
            size: metadata.len(),
            is_dir: false,
            children: None,
        });
    }
    
    // For directories
    let mut children = Vec::new();
    let mut total_size = 0u64;
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            
            if current_depth < target_depth {
                // Scan subdirectories up to target depth
                if let Ok(child) = scan_directory_shallow(&entry_path, app_handle, state, current_depth + 1, target_depth) {
                    total_size += child.size;
                    children.push(child);
                }
            } else {
                // Just calculate size for directories beyond target depth
                if let Ok(size) = calculate_directory_size(&entry_path, state) {
                    total_size += size;
                    
                    // Create a node with aggregated size but no children
                    let child_name = entry_path.file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    
                    if let Ok(meta) = entry.metadata() {
                        children.push(FileNode {
                            name: child_name,
                            path: entry_path.to_string_lossy().to_string(),
                            size,
                            is_dir: meta.is_dir(),
                            children: None, // Don't include children at this depth
                        });
                    }
                }
            }
        }
    }
    
    Ok(FileNode {
        name,
        path: path.to_string_lossy().to_string(),
        size: total_size,
        is_dir: true,
        children: if children.is_empty() { None } else { Some(children) },
    })
}

// Fast recursive size calculation without building full tree structure
#[allow(dead_code)]
fn calculate_directory_size(path: &Path, state: &mut ScanState) -> Result<u64, String> {
    let mut total_size = 0u64;
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            state.items_processed.fetch_add(1, Ordering::Relaxed);
            
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    total_size += metadata.len();
                } else if metadata.is_dir() {
                    // Recursively calculate subdirectory sizes
                    if let Ok(dir_size) = calculate_directory_size(&entry_path, state) {
                        total_size += dir_size;
                    }
                }
            }
        }
    }
    
    Ok(total_size)
}

// Fast parallel directory size calculation
#[allow(dead_code)]
fn calculate_directory_size_fast(path: &Path) -> Result<u64, String> {
    use rayon::prelude::*;
    use std::sync::atomic::AtomicU64;
    use std::sync::Mutex;
    
    let total_size = Arc::new(AtomicU64::new(0));
    
    // Use a work-stealing queue for directories to process
    let dirs_to_process = Arc::new(Mutex::new(vec![path.to_path_buf()]));
    
    while let Some(dir) = {
        let mut dirs = dirs_to_process.lock().unwrap();
        dirs.pop()
    } {
        if let Ok(entries) = fs::read_dir(&dir) {
            let entries: Vec<_> = entries.filter_map(|e| e.ok()).collect();
            
            entries.par_iter().for_each(|entry| {
                if let Ok(metadata) = entry.metadata() {
                    if metadata.is_file() {
                        total_size.fetch_add(metadata.len(), Ordering::Relaxed);
                    } else if metadata.is_dir() {
                        // Add subdirectory to process queue
                        if let Ok(mut dirs) = dirs_to_process.lock() {
                            dirs.push(entry.path());
                        }
                    }
                }
            });
        }
    }
    
    Ok(total_size.load(Ordering::Relaxed))
}

// Smart scanning using mdfind for blazing fast initial results
fn scan_directory_smart(
    path: &Path,
    app_handle: &tauri::AppHandle,
    state: &mut ScanState,
) -> Result<FileNode, String> {
    // Always use mdfind on macOS for now
    if cfg!(target_os = "macos") {
        return scan_directory_with_mdfind(path, app_handle, state);
    }
    
    // Fallback to du for non-macOS systems
    use std::process::{Command, Stdio};
    
    let path_str = path.to_string_lossy();
    
    println!("[SMART] Smart scanning directory: {}", path.display());
    
    // For now, use system dust command
    let dust_path = "dust".to_string();
    println!("[SMART] Using system dust command");
    
    // For now, skip dust and use du directly for large directories
    // Dust can be too slow on very large directories with many files
    let use_dust = false;
    
    if use_dust {
        println!("[SMART] Using dust for fast scanning");
        
        // Run dust with JSON output for easy parsing
        // Use -s flag to suppress progress output which interferes with JSON parsing
        let mut cmd = Command::new(&dust_path)
            .arg("-d")
            .arg("1") // Depth 1
            .arg("-n")
            .arg("200") // Max 200 items
            .arg("-j") // JSON output
            .arg("-s") // Suppress progress output for clean JSON
            .arg(path)
            .stdout(Stdio::piped())
            .stderr(Stdio::null()) // Discard stderr to avoid progress output
            .spawn()
            .map_err(|e| format!("Failed to start dust: {}", e))?;
        
        let stdout = cmd.stdout.take()
            .ok_or_else(|| "Failed to capture stdout".to_string())?;
        
        // Read line by line to get just the JSON line and ignore progress
        use std::io::{BufRead, BufReader};
        let reader = BufReader::new(stdout);
        let mut json_line = String::new();
        
        // The first line should be the JSON output
        for line in reader.lines() {
            if let Ok(line) = line {
                if line.trim().starts_with('{') {
                    json_line = line;
                    break;
                }
            }
        }
        
        println!("[SMART] Dust JSON output length: {} chars", json_line.len());
        if json_line.is_empty() {
            println!("[SMART] ERROR: No JSON output received from dust!");
        } else if json_line.len() < 1000 {
            println!("[SMART] Dust JSON output: {}", json_line);
        } else {
            println!("[SMART] Dust JSON output (first 1000 chars): {}", &json_line[..1000]);
        }
        
        // Don't wait yet - read all output first
        println!("[SMART] Waiting for dust to complete...");
        
        // Now wait for the process to complete
        let status = cmd.wait()
            .map_err(|e| format!("Failed to wait for dust: {}", e))?;
        println!("[SMART] Dust exit status: {:?}", status);
        
        // Parse dust JSON output
        if let Ok(json_data) = serde_json::from_str::<serde_json::Value>(&json_line) {
            println!("[SMART] Parsed JSON successfully");
            // Dust returns a single object with children array
            if let Some(children_array) = json_data.get("children").and_then(|c| c.as_array()) {
                println!("[SMART] Found {} children in dust output", children_array.len());
                let mut children = Vec::new();
                let mut total_size = 0u64;
                
                for (idx, item) in children_array.iter().enumerate() {
                    if idx < 5 {
                        println!("[SMART] Processing child {}: {:?}", idx, item);
                    }
                    if let (Some(name), Some(size_str)) = (
                        item.get("name").and_then(|n| n.as_str()),
                        item.get("size").and_then(|s| s.as_str())
                    ) {
                        // Remove ./ prefix if present
                        let name = name.strip_prefix("./").unwrap_or(name);
                        
                        // Parse size from dust's human-readable format
                        let size = parse_human_size(size_str);
                        let full_path = path.join(name);
                        let is_dir = full_path.is_dir();
                        
                        // Update progress
                        state.items_processed.fetch_add(1, Ordering::Relaxed);
                        if idx % 10 == 0 || state.should_emit() {
                            state.emit(app_handle, &format!("{} ({} items)", name, idx + 1));
                        }
                        
                        children.push(FileNode {
                            name: name.to_string(),
                            path: full_path.to_string_lossy().to_string(),
                            size,
                            is_dir,
                            children: None,
                        });
                        
                        total_size += size;
                    }
                }
                
                // Sort by size
                children.sort_by(|a, b| b.size.cmp(&a.size));
                
                // Filter small files if we have many
                if children.len() > 50 {
                    let min_size = 1024 * 1024; // 1MB
                    children.retain(|child| child.size >= min_size || child.is_dir);
                    children.truncate(100);
                }
                
                println!("[SMART] Dust scan complete: found {} significant items, total size: {}", children.len(), format_size(total_size));
                
                // Get proper name for the directory
                let name = if path_str == "/" {
                    "Root".to_string()
                } else if path == Path::new(&std::env::var("HOME").unwrap_or_default()) {
                    "Home".to_string()
                } else {
                    path.file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| path_str.to_string())
                };
                
                return Ok(FileNode {
                    name,
                    path: path_str.to_string(),
                    size: total_size,
                    is_dir: true,
                    children: if children.is_empty() { None } else { Some(children) },
                });
            } else {
                println!("[SMART] ERROR: No children array found in dust output");
                println!("[SMART] JSON structure: {:?}", json_data);
            }
        } else {
            println!("[SMART] ERROR: Failed to parse dust JSON output");
            println!("[SMART] Raw JSON line was: {}", json_line);
        }
    }
    
    // Use du command for fast initial scanning
    println!("[SMART] Using du command for fast directory scanning");
    state.emit(app_handle, "Starting detailed du scan for comprehensive results...");
    scan_directory_with_du(path, app_handle, state)
}

// Multi-pass mdfind scanning for macOS
fn scan_directory_with_mdfind(
    path: &Path,
    app_handle: &tauri::AppHandle,
    state: &mut ScanState,
) -> Result<FileNode, String> {
    use std::process::Command;
    
    let path_str = path.to_string_lossy();
    println!("[MDFIND] Starting multi-pass mdfind scan on: {}", path_str);
    
    // Multiple passes with decreasing size thresholds
    // Pass 1: > 100MB, Pass 2: > 50MB, Pass 3: > 10MB, Pass 4: > 5MB
    let size_thresholds = [
        (104857600u64, "100MB"),  // 100MB
        (52428800u64, "50MB"),    // 50MB  
        (10485760u64, "10MB"),    // 10MB
        (5242880u64, "5MB"),      // 5MB
    ];
    
    let mut all_files: HashMap<PathBuf, u64> = HashMap::new();
    let mut directory_sizes: HashMap<PathBuf, u64> = HashMap::new();
    
    // Get cached files for this directory to emit as intermediate results
    let cached_files = get_cached_files_for_directory(path);
    if !cached_files.is_empty() {
        println!("[MDFIND] Found {} cached files - emitting as initial preview", cached_files.len());
        
        // Build temporary tree from cached files for immediate display
        let mut cached_tree_files = HashMap::new();
        let mut cached_tree_dirs = HashMap::new();
        
        for (file_path, size) in &cached_files {
            cached_tree_files.insert(file_path.clone(), *size);
            
            // Update directory sizes for cached results
            let mut current_dir = file_path.parent();
            while let Some(dir) = current_dir {
                if dir.starts_with(path) || dir == path {
                    *cached_tree_dirs.entry(dir.to_path_buf()).or_insert(0) += size;
                }
                current_dir = dir.parent();
            }
        }
        
        // Emit cached results as intermediate preview only - don't seed the actual scan
        if let Ok(cached_tree) = build_tree_from_files(&cached_tree_files, &cached_tree_dirs, path) {
            match app_handle.emit("scan-intermediate", &cached_tree) {
                Ok(_) => println!("[MDFIND] Emitted cached preview ({} files) - starting fresh mdfind scan", cached_files.len()),
                Err(e) => println!("[MDFIND] Failed to emit cached preview: {:?}", e),
            }
        }
    }
    
    // Always start fresh mdfind scan regardless of cache
    
    for (pass_idx, (threshold, threshold_name)) in size_thresholds.iter().enumerate() {
        // Check for cancellation
        if state.is_cancelled() {
            println!("[MDFIND] Scan cancelled during pass {}", pass_idx + 1);
            return Err("Scan cancelled".to_string());
        }
        
        state.emit(app_handle, &format!("mdfind pass {}/{}: Finding files larger than {}", 
            pass_idx + 1, size_thresholds.len(), threshold_name));
        
        // Run mdfind command
        let mdfind_cmd = format!(
            "mdfind -onlyin '{}' 'kMDItemFSSize > {}' | head -2000 | while IFS= read -r file; do stat -f '%z %N' \"$file\" 2>/dev/null; done | sort -nr | head -1000",
            path_str, threshold
        );
        
        let output = Command::new("sh")
            .arg("-c")
            .arg(&mdfind_cmd)
            .output()
            .map_err(|e| format!("Failed to execute mdfind: {}", e))?;
        
        let stdout = String::from_utf8_lossy(&output.stdout);
        let new_files_count = stdout.lines().count();
        let files_before_pass = all_files.len();
        println!("[MDFIND] Pass {} found {} files from mdfind", pass_idx + 1, new_files_count);
        
        // Parse the output
        for line in stdout.lines() {
            if let Some(space_idx) = line.find(' ') {
                let (size_str, file_path) = line.split_at(space_idx);
                let file_path = file_path.trim();
                
                if let Ok(size) = size_str.parse::<u64>() {
                    let file_path_buf = PathBuf::from(file_path);
                    
                    // Only process files within our target directory
                    if file_path_buf.starts_with(path) {
                        // Skip if we already have this file from a previous pass or cache
                        if !all_files.contains_key(&file_path_buf) {
                            all_files.insert(file_path_buf.clone(), size);
                            
                            // Update directory sizes for all parent directories
                            let mut current_dir = file_path_buf.parent();
                            while let Some(dir) = current_dir {
                                if dir.starts_with(path) || dir == path {
                                    *directory_sizes.entry(dir.to_path_buf()).or_insert(0) += size;
                                }
                                current_dir = dir.parent();
                            }
                        } else {
                            // File was already known (from cache or previous pass)
                        }
                    }
                }
            }
        }
        
        // Update progress
        let files_after_pass = all_files.len();
        let new_files_added = files_after_pass - files_before_pass;
        state.items_processed.store(all_files.len() as u32, Ordering::Relaxed);
        state.emit(app_handle, &format!("mdfind: Found {} large files ({} new in this pass {}/{})", 
            all_files.len(), new_files_added, pass_idx + 1, size_thresholds.len()));
        
        println!("[MDFIND] Pass {} added {} new files (total: {})", 
            pass_idx + 1, new_files_added, files_after_pass);
        
        // Emit intermediate results after each pass if we have files
        if all_files.len() > 10 {
            println!("[MDFIND] Emitting intermediate results with {} files", all_files.len());
            // Build and emit intermediate tree
            if let Ok(intermediate_tree) = build_tree_from_files(&all_files, &directory_sizes, path) {
                // Emit intermediate result event
                match app_handle.emit("scan-intermediate", &intermediate_tree) {
                    Ok(_) => println!("[MDFIND] Successfully emitted intermediate results"),
                    Err(e) => println!("[MDFIND] Failed to emit intermediate results: {:?}", e),
                }
            }
        }
    }
    
    // Emit final status update
    state.emit(app_handle, &format!("mdfind complete: {} files found. Building directory tree...", all_files.len()));
    
    // Update cache with discovered files
    add_files_to_cache(&all_files);
    
    // Build final tree structure from collected files
    build_tree_from_files(&all_files, &directory_sizes, path)
}

// Helper function to build tree structure from file list
fn build_tree_from_files(
    files: &HashMap<PathBuf, u64>,
    dir_sizes: &HashMap<PathBuf, u64>,
    root_path: &Path,
) -> Result<FileNode, String> {
    
    // Create a hierarchical structure
    let root_path_str = root_path.to_string_lossy();
    let home_path = std::env::var("HOME").unwrap_or_default();
    
    let root_name = if root_path_str == "/" {
        "Root".to_string()
    } else if root_path_str == home_path {
        "Home".to_string()
    } else {
        root_path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Root".to_string())
    };
    
    // Calculate total size from all files
    let total_size: u64 = files.values().sum();
    
    let mut root = FileNode {
        name: root_name,
        path: root_path_str.to_string(),
        size: total_size,
        is_dir: true,
        children: Some(Vec::new()),
    };
    
    // Group files by their parent directory
    let mut dir_contents: HashMap<PathBuf, Vec<FileNode>> = HashMap::new();
    
    for (file_path, size) in files {
        if let Some(parent) = file_path.parent() {
            let file_node = FileNode {
                name: file_path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                path: file_path.to_string_lossy().to_string(),
                size: *size,
                is_dir: false,
                children: None,
            };
            
            dir_contents.entry(parent.to_path_buf())
                .or_insert_with(Vec::new)
                .push(file_node);
        }
    }
    
    // Add directories that contain files
    let mut all_dirs: Vec<PathBuf> = dir_sizes.keys().cloned().collect();
    all_dirs.sort_by(|a, b| a.components().count().cmp(&b.components().count()));
    
    // Build directory nodes
    let mut dir_nodes: HashMap<PathBuf, FileNode> = HashMap::new();
    
    for dir_path in &all_dirs {
        if dir_path == root_path {
            continue;
        }
        
        // Get files for this directory
        let dir_children = dir_contents.remove(dir_path).unwrap_or_default();
        
        // Only create directory node if it has significant size
        let dir_size = *dir_sizes.get(dir_path).unwrap_or(&0);
        if dir_size > 0 {
            let dir_node = FileNode {
                name: dir_path.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                path: dir_path.to_string_lossy().to_string(),
                size: dir_size,
                is_dir: true,
                children: if dir_children.is_empty() { None } else { Some(dir_children) },
            };
            
            dir_nodes.insert(dir_path.clone(), dir_node);
        }
    }
    
    // Get first-level directories under root
    let mut root_children: Vec<FileNode> = Vec::new();
    
    // Find all immediate subdirectories of root
    let root_level = root_path.components().count();
    let mut immediate_subdirs: Vec<PathBuf> = all_dirs.iter()
        .filter(|p| p.components().count() == root_level + 1 && p.starts_with(root_path))
        .cloned()
        .collect();
    immediate_subdirs.sort();
    
    println!("[BUILD] Found {} immediate subdirectories", immediate_subdirs.len());
    
    // Build tree for each immediate subdirectory
    for subdir in immediate_subdirs {
        let subdir_size = *dir_sizes.get(&subdir).unwrap_or(&0);
        if subdir_size > 0 {
            // Collect all descendant directories
            let mut subdir_node = FileNode {
                name: subdir.file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_default(),
                path: subdir.to_string_lossy().to_string(),
                size: subdir_size,
                is_dir: true,
                children: None,
            };
            
            // Add any files directly in this subdirectory
            if let Some(files) = dir_contents.remove(&subdir) {
                if !files.is_empty() {
                    subdir_node.children = Some(files);
                }
            }
            
            root_children.push(subdir_node);
        }
    }
    
    // Add any files directly in root
    if let Some(root_files) = dir_contents.remove(root_path) {
        for file in root_files {
            root_children.push(file);
        }
    }
    
    // Sort children by size
    root_children.sort_by(|a, b| b.size.cmp(&a.size));
    
    // Only show the largest items in the treemap
    if root_children.len() > 100 {
        root_children.truncate(100);
    }
    
    root.children = if root_children.is_empty() { None } else { Some(root_children) };
    
    println!("[BUILD] Final tree has {} children, total size: {}", 
        root.children.as_ref().map(|c| c.len()).unwrap_or(0),
        format_size(root.size));
    
    Ok(root)
}

// Fallback scanning using du command
fn scan_directory_with_du(
    path: &Path,
    app_handle: &tauri::AppHandle,
    state: &mut ScanState,
) -> Result<FileNode, String> {
    use std::process::Command;
    
    let path_str = path.to_string_lossy();
    
    // Use a simpler approach - run du and collect all output at once
    println!("[DU] Running du command on: {}", path.display());
    
    // First, get a list of visible files and directories
    let output = Command::new("sh")
        .arg("-c")
        .arg(&format!("cd '{}' && du -sk * 2>/dev/null | sort -rn | head -100", path.display()))
        .output()
        .map_err(|e| format!("Failed to execute du: {}", e))?;
    
    if !output.status.success() {
        println!("[DU] du command failed with status: {:?}", output.status);
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    println!("[DU] du output length: {} chars", stdout.len());
    
    let mut children = Vec::new();
    let mut total_size = 0u64;
    
    // Check cache for any relevant files in this directory
    let cached_files = get_cached_files_for_directory(path);
    for (cached_path, cached_size) in cached_files {
        if let Some(name) = cached_path.file_name() {
            children.push(FileNode {
                name: name.to_string_lossy().to_string(),
                path: cached_path.to_string_lossy().to_string(),
                size: cached_size,
                is_dir: cached_path.is_dir(),
                children: None,
            });
            total_size += cached_size;
        }
    }
    
    // Parse du output
    let lines: Vec<&str> = stdout.lines().collect();
    println!("[DU] Got {} lines from du", lines.len());
    
    for (idx, line) in lines.iter().enumerate() {
        // Check for cancellation
        if state.is_cancelled() {
            println!("[DU] Scan cancelled during processing");
            return Err("Scan cancelled".to_string());
        }
        
        if line.trim().is_empty() {
            continue;
        }
        
        // Parse line like "294912  node_modules" (size in KB)
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 2 {
            let size_kb_str = parts[0].trim();
            let name = parts[1..].join(" "); // Handle names with spaces
            
            // Parse size (du -sk gives size in KB)
            if let Ok(size_kb) = size_kb_str.parse::<u64>() {
                let size = size_kb * 1024; // Convert to bytes
                let full_path = path.join(&name);
                let is_dir = full_path.is_dir();
                
                // Update progress
                if idx % 5 == 0 {
                    state.items_processed.fetch_add(1, Ordering::Relaxed);
                    state.emit(app_handle, &format!("du scan: Found {} items", idx + 1));
                }
                
                children.push(FileNode {
                    name: name.clone(),
                    path: full_path.to_string_lossy().to_string(),
                    size,
                    is_dir,
                    children: None,
                });
                
                total_size += size;
                
                if idx < 5 {
                    println!("[DU] Item {}: {} ({} KB)", idx, name, size_kb);
                }
            }
        }
    }
    
    println!("[DU] Found {} children before filtering", children.len());
    
    // If we got no results from du, try a different approach
    if children.is_empty() {
        println!("[DU] WARNING: No results from du command, trying ls approach");
        // Try listing directory contents directly
        if let Ok(entries) = fs::read_dir(path) {
            for (idx, entry) in entries.enumerate() {
                if let Ok(entry) = entry {
                    if let Ok(metadata) = entry.metadata() {
                        let name = entry.file_name().to_string_lossy().to_string();
                        // Skip hidden files starting with .
                        if !name.starts_with('.') {
                            let size = if metadata.is_dir() {
                                // For directories, estimate size (we'll scan them later)
                                1024 * 1024 // 1MB placeholder
                            } else {
                                metadata.len()
                            };
                            
                            children.push(FileNode {
                                name: name.clone(),
                                path: entry.path().to_string_lossy().to_string(),
                                size,
                                is_dir: metadata.is_dir(),
                                children: None,
                            });
                            
                            total_size += size;
                            
                            // Update progress
                            state.items_processed.fetch_add(1, Ordering::Relaxed);
                            if idx % 5 == 0 || state.should_emit() {
                                state.emit(app_handle, &format!("du fallback: Found {} items", children.len()));
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Sort by size (largest first)
    children.sort_by(|a, b| b.size.cmp(&a.size));
    
    // Filter out very small files (less than 1MB) if we have many items
    if children.len() > 50 {
        let min_size = 1024 * 1024; // 1MB threshold
        children.retain(|child| child.size >= min_size || child.is_dir);
        children.truncate(100); // Keep only top 100 items
    }
    
    println!("[DU] Scan complete: found {} significant items, total size: {}", children.len(), format_size(total_size));
    
    // Get proper name for the directory
    let name = if path_str == "/" {
        "Root".to_string()
    } else if path == Path::new(&std::env::var("HOME").unwrap_or_default()) {
        "Home".to_string()
    } else {
        path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| path_str.to_string())
    };

    Ok(FileNode {
        name,
        path: path_str.to_string(),
        size: total_size,
        is_dir: true,
        children: if children.is_empty() { None } else { Some(children) },
    })
}

// Helper function to parse human-readable sizes like "4.0K", "294M", "3.5G"
fn parse_human_size(size_str: &str) -> u64 {
    if size_str.trim().is_empty() || size_str == "0B" {
        return 0;
    }
    
    // Remove any whitespace
    let size_str = size_str.trim();
    
    // Find where the number ends and unit begins
    let num_end = size_str.find(|c: char| !c.is_numeric() && c != '.').unwrap_or(size_str.len());
    
    if num_end == 0 {
        return 0;
    }
    
    let (num_str, unit) = size_str.split_at(num_end);
    let number: f64 = num_str.parse().unwrap_or(0.0);
    
    // Parse unit (K, M, G, T, P)
    let multiplier = match unit.trim().to_uppercase().as_str() {
        "B" | "" => 1.0,
        "K" | "KB" => 1024.0,
        "M" | "MB" => 1024.0 * 1024.0,
        "G" | "GB" => 1024.0 * 1024.0 * 1024.0,
        "T" | "TB" => 1024.0 * 1024.0 * 1024.0 * 1024.0,
        "P" | "PB" => 1024.0 * 1024.0 * 1024.0 * 1024.0 * 1024.0,
        _ => 1.0,
    };
    
    (number * multiplier) as u64
}

// Helper function to format sizes
fn format_size(size: u64) -> String {
    const UNITS: &[&str] = &["B", "KB", "MB", "GB", "TB"];
    let mut size = size as f64;
    let mut unit_index = 0;
    
    while size >= 1024.0 && unit_index < UNITS.len() - 1 {
        size /= 1024.0;
        unit_index += 1;
    }
    
    format!("{:.1}{}", size, UNITS[unit_index])
}






