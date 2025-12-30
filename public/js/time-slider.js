// Time Slider Histogram for Claude Chat History Viewer

(function() {
    'use strict';

    // State
    let currentMetric = 'conversations'; // 'conversations' or 'messages'
    let buckets = [];
    let allBuckets = []; // Store unfiltered buckets for reference
    let currentFolder = ''; // Current folder filter
    let selectionStart = null;
    let selectionEnd = null;
    let isDragging = false;
    let dragStartIndex = null;

    // Callbacks
    let onRangeChangeCallback = null;

    // DOM Elements (initialized in init)
    let histogramBars = null;
    let timeLabels = null;
    let metricToggle = null;
    let metricLabel = null;
    let clearRangeBtn = null;
    let rangeDisplay = null;
    let histogramSelection = null;

    // Initialize the histogram
    function init() {
        histogramBars = document.getElementById('histogram-bars');
        timeLabels = document.getElementById('time-labels');
        metricToggle = document.getElementById('metric-toggle');
        metricLabel = document.getElementById('metric-label');
        clearRangeBtn = document.getElementById('clear-range');
        rangeDisplay = document.getElementById('range-display');
        histogramSelection = document.getElementById('histogram-selection');

        if (!histogramBars || !window.conversationData) {
            return;
        }

        // Process data and render
        processData(window.conversationData);
        render();

        // Set up event listeners
        setupEventListeners();
    }

    // Process conversation data into buckets
    function processData(conversations) {
        if (!conversations || conversations.length === 0) {
            buckets = [];
            return;
        }

        // Find date range
        const dates = conversations.map(c => new Date(c.date)).filter(d => !isNaN(d));
        if (dates.length === 0) {
            buckets = [];
            return;
        }

        const minDate = new Date(Math.min(...dates));
        const maxDate = new Date(Math.max(...dates));

        // Determine granularity based on range
        const daysDiff = Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24));
        const granularity = daysDiff > 60 ? 'week' : 'day';

        // Create buckets
        buckets = createBuckets(minDate, maxDate, granularity, conversations);
    }

    // Create time buckets with aggregated data
    function createBuckets(minDate, maxDate, granularity, conversations) {
        const result = [];
        const bucketMap = new Map();

        // Normalize dates to start of day/week
        const start = new Date(minDate);
        start.setHours(0, 0, 0, 0);
        if (granularity === 'week') {
            start.setDate(start.getDate() - start.getDay()); // Start of week (Sunday)
        }

        const end = new Date(maxDate);
        end.setHours(23, 59, 59, 999);

        // Create empty buckets for the entire range
        const current = new Date(start);
        while (current <= end) {
            const key = getBucketKey(current, granularity);
            bucketMap.set(key, {
                date: new Date(current),
                key: key,
                conversations: 0,
                messages: 0,
                granularity: granularity
            });

            // Advance to next bucket
            if (granularity === 'week') {
                current.setDate(current.getDate() + 7);
            } else {
                current.setDate(current.getDate() + 1);
            }
        }

        // Aggregate conversation data into buckets
        conversations.forEach(conv => {
            const date = new Date(conv.date);
            if (isNaN(date)) return;

            const key = getBucketKey(date, granularity);
            const bucket = bucketMap.get(key);
            if (bucket) {
                bucket.conversations++;
                bucket.messages += conv.messages || 0;
            }
        });

        // Convert to array and sort by date
        bucketMap.forEach(bucket => result.push(bucket));
        result.sort((a, b) => a.date - b.date);

        return result;
    }

    // Get bucket key for a date
    function getBucketKey(date, granularity) {
        const d = new Date(date);
        if (granularity === 'week') {
            d.setDate(d.getDate() - d.getDay()); // Start of week
        }
        return d.toISOString().split('T')[0];
    }

    // Render the histogram
    function render() {
        if (!histogramBars || buckets.length === 0) {
            if (histogramBars) {
                histogramBars.innerHTML = '<div class="no-data">No conversation data</div>';
            }
            return;
        }

        // Find max value for scaling
        const maxValue = Math.max(...buckets.map(b =>
            currentMetric === 'conversations' ? b.conversations : b.messages
        ));

        // Render bars with full-height clickable containers
        histogramBars.innerHTML = buckets.map((bucket, index) => {
            const value = currentMetric === 'conversations' ? bucket.conversations : bucket.messages;
            const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const isSelected = isIndexInSelection(index);
            const selectedClass = isSelected ? 'selected' : '';

            // Wrap bar in full-height container for easier clicking
            return `<div class="histogram-bar-container" data-index="${index}" title="${formatTooltip(bucket)}">
                        <div class="histogram-bar ${selectedClass}"
                            data-index="${index}"
                            data-date="${bucket.key}"
                            data-conversations="${bucket.conversations}"
                            data-messages="${bucket.messages}"
                            style="height: ${Math.max(height, 2)}%">
                        </div>
                    </div>`;
        }).join('');

        // Render date labels (show fewer labels to avoid crowding)
        const labelInterval = Math.ceil(buckets.length / 8);
        timeLabels.innerHTML = buckets
            .filter((_, i) => i % labelInterval === 0 || i === buckets.length - 1)
            .map(bucket => {
                const date = bucket.date;
                const label = bucket.granularity === 'week'
                    ? `${date.getMonth() + 1}/${date.getDate()}`
                    : `${date.getMonth() + 1}/${date.getDate()}`;
                return `<span class="time-label">${label}</span>`;
            }).join('');

        // Update selection overlay
        updateSelectionOverlay();
    }

    // Check if an index is within the current selection
    function isIndexInSelection(index) {
        if (selectionStart === null) return false;
        const start = Math.min(selectionStart, selectionEnd ?? selectionStart);
        const end = Math.max(selectionStart, selectionEnd ?? selectionStart);
        return index >= start && index <= end;
    }

    // Format tooltip for a bucket
    function formatTooltip(bucket) {
        const date = bucket.date;
        const dateStr = date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
        return `${dateStr}\n${bucket.conversations} conversations\n${bucket.messages} messages`;
    }

    // Update the selection overlay visualization
    function updateSelectionOverlay() {
        if (!histogramSelection) return;

        if (selectionStart === null) {
            histogramSelection.style.display = 'none';
            return;
        }

        const start = Math.min(selectionStart, selectionEnd ?? selectionStart);
        const end = Math.max(selectionStart, selectionEnd ?? selectionStart);

        const barWidth = 100 / buckets.length;
        const left = start * barWidth;
        const width = (end - start + 1) * barWidth;

        histogramSelection.style.display = 'block';
        histogramSelection.style.left = `${left}%`;
        histogramSelection.style.width = `${width}%`;
    }

    // Set up event listeners
    function setupEventListeners() {
        // Metric toggle
        if (metricToggle) {
            metricToggle.addEventListener('click', toggleMetric);
        }

        // Clear range button
        if (clearRangeBtn) {
            clearRangeBtn.addEventListener('click', clearSelection);
        }

        // Histogram bar interactions
        if (histogramBars) {
            histogramBars.addEventListener('mousedown', handleMouseDown);
            histogramBars.addEventListener('mousemove', handleMouseMove);
            histogramBars.addEventListener('mouseup', handleMouseUp);
            histogramBars.addEventListener('mouseleave', handleMouseUp);

            // Touch support
            histogramBars.addEventListener('touchstart', handleTouchStart, { passive: false });
            histogramBars.addEventListener('touchmove', handleTouchMove, { passive: false });
            histogramBars.addEventListener('touchend', handleTouchEnd);
        }
    }

    // Toggle between conversations and messages metric
    function toggleMetric() {
        currentMetric = currentMetric === 'conversations' ? 'messages' : 'conversations';
        if (metricLabel) {
            metricLabel.textContent = currentMetric === 'conversations' ? 'Conversations' : 'Messages';
        }
        render();
    }

    // Get index from event target (works with both bar and container)
    function getIndexFromTarget(target) {
        const container = target.closest('.histogram-bar-container');
        if (container) {
            return parseInt(container.dataset.index, 10);
        }
        const bar = target.closest('.histogram-bar');
        if (bar) {
            return parseInt(bar.dataset.index, 10);
        }
        return null;
    }

    // Handle mouse down on histogram
    function handleMouseDown(e) {
        const index = getIndexFromTarget(e.target);
        if (index === null) return;

        isDragging = true;
        dragStartIndex = index;
        selectionStart = index;
        selectionEnd = index;

        render();
    }

    // Handle mouse move during drag
    function handleMouseMove(e) {
        if (!isDragging) return;

        const index = getIndexFromTarget(e.target);
        if (index === null) return;

        selectionEnd = index;

        render();
    }

    // Handle mouse up to complete selection
    function handleMouseUp() {
        if (!isDragging) return;
        isDragging = false;

        if (selectionStart !== null) {
            const start = Math.min(selectionStart, selectionEnd ?? selectionStart);
            const end = Math.max(selectionStart, selectionEnd ?? selectionStart);

            // Normalize selection indices
            selectionStart = start;
            selectionEnd = end;

            // Show clear button and range display
            if (clearRangeBtn) {
                clearRangeBtn.style.display = 'inline-block';
            }
            updateRangeDisplay();

            // Notify listeners
            notifyRangeChange();
        }
    }

    // Touch event handlers
    function handleTouchStart(e) {
        e.preventDefault();
        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const index = element ? getIndexFromTarget(element) : null;
        if (index === null) return;

        isDragging = true;
        dragStartIndex = index;
        selectionStart = index;
        selectionEnd = index;

        render();
    }

    function handleTouchMove(e) {
        if (!isDragging) return;
        e.preventDefault();

        const touch = e.touches[0];
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        const index = element ? getIndexFromTarget(element) : null;
        if (index === null) return;

        selectionEnd = index;

        render();
    }

    function handleTouchEnd() {
        handleMouseUp();
    }

    // Clear the current selection
    function clearSelection() {
        selectionStart = null;
        selectionEnd = null;

        if (clearRangeBtn) {
            clearRangeBtn.style.display = 'none';
        }
        if (rangeDisplay) {
            rangeDisplay.style.display = 'none';
        }

        render();
        notifyRangeChange();
    }

    // Update the range display text
    function updateRangeDisplay() {
        if (!rangeDisplay || selectionStart === null) return;

        const start = Math.min(selectionStart, selectionEnd ?? selectionStart);
        const end = Math.max(selectionStart, selectionEnd ?? selectionStart);

        const startDate = buckets[start]?.date;
        const endDate = buckets[end]?.date;

        if (!startDate || !endDate) return;

        const formatDate = (d) => d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric'
        });

        rangeDisplay.textContent = start === end
            ? formatDate(startDate)
            : `${formatDate(startDate)} - ${formatDate(endDate)}`;
        rangeDisplay.style.display = 'block';
    }

    // Notify listeners of range change
    function notifyRangeChange() {
        if (onRangeChangeCallback) {
            let startDate = null;
            let endDate = null;

            if (selectionStart !== null) {
                const start = Math.min(selectionStart, selectionEnd ?? selectionStart);
                const end = Math.max(selectionStart, selectionEnd ?? selectionStart);

                startDate = buckets[start]?.date;
                endDate = buckets[end]?.date;

                // Set end date to end of day
                if (endDate) {
                    endDate = new Date(endDate);
                    endDate.setHours(23, 59, 59, 999);
                }
            }

            onRangeChangeCallback(startDate, endDate);
        }
    }

    // Filter data by folder
    function filterByFolder(folder) {
        currentFolder = folder || '';

        // Clear selection when folder changes
        selectionStart = null;
        selectionEnd = null;
        if (clearRangeBtn) {
            clearRangeBtn.style.display = 'none';
        }
        if (rangeDisplay) {
            rangeDisplay.style.display = 'none';
        }

        // Filter conversation data by folder
        let filteredData = window.conversationData || [];
        if (currentFolder) {
            filteredData = filteredData.filter(c => c.project === currentFolder);
        }

        // Re-process and render with filtered data
        processData(filteredData);
        render();

        // Notify that selection was cleared
        notifyRangeChange();
    }

    // Public API
    window.TimeSlider = {
        init: init,
        onRangeChange: function(callback) {
            onRangeChangeCallback = callback;
        },
        clearSelection: clearSelection,
        filterByFolder: filterByFolder,
        getSelection: function() {
            if (selectionStart === null) return null;
            const start = Math.min(selectionStart, selectionEnd ?? selectionStart);
            const end = Math.max(selectionStart, selectionEnd ?? selectionStart);
            return {
                startDate: buckets[start]?.date,
                endDate: buckets[end]?.date
            };
        },
        setSelection: function(startDate, endDate) {
            if (!startDate) {
                clearSelection();
                return;
            }

            // Find bucket indices for the dates
            const startTime = new Date(startDate).getTime();
            const endTime = endDate ? new Date(endDate).getTime() : startTime;

            selectionStart = buckets.findIndex(b => b.date.getTime() >= startTime);
            selectionEnd = buckets.findIndex(b => b.date.getTime() >= endTime);

            if (selectionStart === -1) selectionStart = 0;
            if (selectionEnd === -1) selectionEnd = buckets.length - 1;

            if (clearRangeBtn) {
                clearRangeBtn.style.display = 'inline-block';
            }
            updateRangeDisplay();
            render();
        }
    };

    // Initialize on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
