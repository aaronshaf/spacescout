use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct ScanState {
    pub should_cancel: Arc<AtomicBool>,
}

impl ScanState {
    pub fn new() -> Self {
        Self {
            should_cancel: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn cancel(&self) {
        self.should_cancel.store(true, Ordering::Relaxed);
    }

    pub fn is_cancelled(&self) -> bool {
        self.should_cancel.load(Ordering::Relaxed)
    }

    pub fn reset(&self) {
        self.should_cancel.store(false, Ordering::Relaxed);
    }
}