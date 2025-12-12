<script lang="ts">
	import P5, { type Sketch } from 'p5-svelte';

	import type p5 from 'p5';
	import MdHelpOutline from 'svelte-icons/md/MdHelpOutline.svelte';
	import MdCloudUpload from 'svelte-icons/md/MdCloudUpload.svelte';
	import MdVideocam from 'svelte-icons/md/MdVideocam.svelte';
	import MdVideocamOff from 'svelte-icons/md/MdVideocamOff.svelte';
	import MdCheck from 'svelte-icons/md/MdCheck.svelte';
	import MdSettings from 'svelte-icons/md/MdSettings.svelte';
	import MdSubject from 'svelte-icons/md/MdSubject.svelte';
	import type { User } from '../../models/user';
	import UserStore from '../../stores/userStore';
	import P5Store from '../../stores/p5Store';
	import VideoStore from '../../stores/videoStore';
	import EditorStore from '../../stores/editorStore';

	import { Core } from '$lib';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { writable } from 'svelte/store';
	import { onMount } from 'svelte';
	import IconButton from '$lib/components/IconButton.svelte';
	import InfoModal from '$lib/components/InfoModal.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import DataPointTable from '$lib/components/DataPointTable.svelte';
	import SplitPane from '$lib/components/SplitPane.svelte';
	import TranscriptEditor from '$lib/components/TranscriptEditor.svelte';
	import CanvasTooltip from '$lib/components/CanvasTooltip.svelte';
	import VideoOverlay from '$lib/components/VideoOverlay.svelte';

	import TimelineStore from '../../stores/timelineStore';
	import ConfigStore from '../../stores/configStore';
	import type { ConfigStoreType } from '../../stores/configStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import { computePosition, flip, shift, offset, autoUpdate } from '@floating-ui/dom';

	// Define ToggleKey type to fix TypeScript errors
	type ToggleKey = string;

	// Floating UI references
	type FloatingElement = {
		button: HTMLElement | null;
		content: HTMLElement | null;
		cleanup: (() => void) | null;
		isOpen: boolean;
	};

	// Store references to floating elements
	const floatingElements: Record<string, FloatingElement> = {};

	// Function to position a floating element
	function positionFloatingElement(reference: HTMLElement, floating: HTMLElement) {
		return computePosition(reference, floating, {
			placement: 'top',
			middleware: [
				offset(6),
				flip(),
				shift({ padding: 5 })
			]
		}).then(({ x, y }) => {
			Object.assign(floating.style, {
				left: `${x}px`,
				top: `${y}px`,
				position: 'absolute',
				width: 'max-content',
				zIndex: '100'
			});
		});
	}

	// Function to toggle a floating element
	function toggleFloating(id: string) {
		const element = floatingElements[id];
		if (!element || !element.button || !element.content) return;

		element.isOpen = !element.isOpen;

		if (element.isOpen) {
			// Show the floating element
			element.content.style.display = 'block';
			document.body.appendChild(element.content);

			// Position it initially
			positionFloatingElement(element.button, element.content);

			// Set up auto-update to reposition on scroll/resize
			element.cleanup = autoUpdate(
				element.button,
				element.content,
				() => positionFloatingElement(element.button, element.content)
			);

			// Add click outside listener
			const handleClickOutside = (event: MouseEvent) => {
				if (
					element.content &&
					element.button &&
					!element.content.contains(event.target as Node) &&
					!element.button.contains(event.target as Node)
				) {
					toggleFloating(id);
				}
			};

			document.addEventListener('click', handleClickOutside);

			// Update cleanup to include removing the event listener
			const prevCleanup = element.cleanup;
			element.cleanup = () => {
				prevCleanup?.();
				document.removeEventListener('click', handleClickOutside);
			};
		} else {
			// Hide the floating element
			if (element.content) {
				element.content.style.display = 'none';
			}

			// Clean up auto-update
			if (element.cleanup) {
				element.cleanup();
				element.cleanup = null;
			}
		}
	}

	// Function to register a floating element
	function registerFloating(id: string, button: HTMLElement, content: HTMLElement) {
		floatingElements[id] = {
			button,
			content,
			cleanup: null,
			isOpen: false
		};

		// Initially hide the content
		content.style.display = 'none';
	}

	// Action function for initializing floating elements
	function initFloating(node: HTMLElement) {
		const userId = node.getAttribute('data-user-id');
		if (userId) {
			const button = document.querySelector(`button[data-user="${userId}"]`);
			if (button) {
				registerFloating(`user-${userId}`, button as HTMLElement, node);
			}
		}

		return {
			destroy() {
				// Cleanup if needed
			}
		};
	}

	// Add click outside and scroll handlers for dropdowns
	onMount(() => {
		// Add global click handler to close dropdowns when clicking outside
		document.addEventListener('click', (event) => {
			const target = event.target as HTMLElement;

			// Close all dropdowns when clicking outside
			$UserStore.forEach(user => {
				const dropdown = document.getElementById(`dropdown-${user.name}`);
				const button = document.getElementById(`btn-${user.name}`);

				if (dropdown && button &&
					!dropdown.contains(target) &&
					!button.contains(target) &&
					!dropdown.classList.contains('hidden')) {
					dropdown.classList.add('hidden');
				}
			});
		});

		// Add scroll handler to close dropdowns when scrolling
		const userContainer = document.querySelector('.btm-nav .overflow-x-auto');
		if (userContainer) {
			userContainer.addEventListener('scroll', () => {
				// Close all dropdowns when scrolling
				$UserStore.forEach(user => {
					const dropdown = document.getElementById(`dropdown-${user.name}`);
					if (dropdown && !dropdown.classList.contains('hidden')) {
						dropdown.classList.add('hidden');
					}
				});
			});
		}
	});

	const techniqueToggleOptions = ['distributionDiagramToggle', 'turnChartToggle', 'contributionCloudToggle', 'dashboardToggle'] as const;

	// Define which interactions apply to which visualizations
	const distributionDiagramInteractions = ['flowersToggle'] as const;
	const turnChartInteractions = ['separateToggle'] as const;
	const contributionCloudInteractions = ['separateToggle', 'sortToggle', 'lastWordToggle', 'echoWordsToggle', 'stopWordsToggle', 'repeatedWordsToggle'] as const;
	const allInteractions = [...new Set([...distributionDiagramInteractions, ...turnChartInteractions, ...contributionCloudInteractions])] as const;

	// Compute visible interactions based on active visualization
	$: visibleInteractions = (() => {
		if ($ConfigStore.dashboardToggle) {
			return allInteractions;
		} else if ($ConfigStore.distributionDiagramToggle) {
			return distributionDiagramInteractions;
		} else if ($ConfigStore.turnChartToggle) {
			return turnChartInteractions;
		} else if ($ConfigStore.contributionCloudToggle) {
			return contributionCloudInteractions;
		}
		return allInteractions; // fallback
	})();

	// Check if repeated words slider should show (only for contribution cloud or dashboard)
	$: showRepeatedWordsSlider = $ConfigStore.contributionCloudToggle || $ConfigStore.dashboardToggle;

	let selectedDropDownOption = '';
	const dropdownOptions = [
		{
			label: 'Classrooms',
			items: [
				{ value: 'example-1', label: 'Kindergarten Activity' },
				{ value: 'example-3', label: 'Classroom Discussion' },
				{ value: 'example-4', label: 'Classroom Science Lesson' }
			]
		},
		{ label: 'Museums', items: [{ value: 'example-2', label: 'Family Gallery Visit' }] },
		{ label: 'Presidential Debates', items: [{ value: 'example-5', label: 'Biden-Trump 2020 Debate' }] }
	];

	let showDataPopup = false;
	let showSettings = false;
	let showDataDropDown = false;
	let currentConfig: ConfigStoreType;

	let files: any = [];
	let users: User[] = [];
	let p5Instance: p5 | null = null;
	let core: Core;
	let isVideoShowing = false;
	let isVideoPlaying = false;
	let timeline;

	ConfigStore.subscribe((value) => {
		currentConfig = value;
	});

	TimelineStore.subscribe((value) => {
		timeline = value;
	});

	VideoStore.subscribe((value) => {
		isVideoShowing = value.isShowing;
		isVideoPlaying = value.isPlaying;
	});

	UserStore.subscribe((data) => {
		users = data;
	});

	P5Store.subscribe((value) => {
		p5Instance = value;

		if (p5Instance) {
			core = new Core(p5Instance);
		}
	});

	const sketch: Sketch = (p5: p5) => {
		igsSketch(p5);
	};

	let isModalOpen = writable(true);

	// TODO: this deals with reactive state not updating correctly when values switch from true to false
	let prevConfig = {
		echoWordsToggle: currentConfig.echoWordsToggle,
		lastWordToggle: currentConfig.lastWordToggle,
		stopWordsToggle: currentConfig.stopWordsToggle
	};
	$: {
		const { lastWordToggle, stopWordsToggle, echoWordsToggle } = currentConfig;
		if (echoWordsToggle !== prevConfig.echoWordsToggle || lastWordToggle !== prevConfig.lastWordToggle || stopWordsToggle !== prevConfig.stopWordsToggle) {
			p5Instance?.fillSelectedData();
		}
		prevConfig = { echoWordsToggle, lastWordToggle, stopWordsToggle };
	}

	// Watch for editor layout changes (orientation, collapse) and trigger canvas resize
	let prevEditorConfig = {
		orientation: $EditorStore.config.orientation,
		isCollapsed: $EditorStore.config.isCollapsed
	};
	$: {
		const { orientation, isCollapsed } = $EditorStore.config;
		if (orientation !== prevEditorConfig.orientation || isCollapsed !== prevEditorConfig.isCollapsed) {
			// Trigger resize after DOM updates
			requestAnimationFrame(() => {
				triggerCanvasResize();
			});
		}
		prevEditorConfig = { orientation, isCollapsed };
	}

	function toggleVideo() {
		if (p5Instance && p5Instance.videoController) {
			p5Instance.videoController.toggleShowVideo();
			VideoStore.update((value) => {
				value.isShowing = p5Instance.videoController.isShowing;
				value.isPlaying = p5Instance.videoController.isPlaying;
				return value;
			});
		}
	}

	function capitalizeEachWord(sentence: string) {
		return sentence
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
	}

	function formatToggleName(toggle) {
		return toggle
			.replace('Toggle', '') // Remove 'Toggle'
			.replace(/([A-Z])/g, ' $1') // Add space before capital letters
			.trim()
			.replace(/^./, (str) => str.toUpperCase()); // Capitalize first letter
	}

	function handleConfigChangeFromInput(e: Event, key: keyof ConfigStoreType) {
		const target = e.target as HTMLInputElement;
		ConfigStore.update((value) => ({
			...value,
			[key]: parseFloat(target.value)
		}));
	}

	function handleConfigChange(key: keyof ConfigStoreType, value: any) {
		ConfigStore.update((store) => ({
			...store,
			[key]: value
		}));
	}

	function toggleSelection(selection: ToggleKey, toggleOptions: ToggleKey[]) {
		ConfigStore.update((store: ConfigStoreType) => {
			const updatedStore = { ...store };
			toggleOptions.forEach((key) => {
				if (key.endsWith('Toggle')) {
					updatedStore[key] = key === selection ? !updatedStore[key] : false;
				}
			});
			return updatedStore;
		});
		p5Instance?.fillSelectedData();
	}

	function toggleSelectionOnly(selection: ToggleKey, toggleOptions: ToggleKey[]) {
		ConfigStore.update((store: ConfigStoreType) => {
			const updatedStore = { ...store };
			toggleOptions.forEach((key) => {
				if (key === selection && key.endsWith('Toggle')) {
					updatedStore[key] = !updatedStore[key];
				}
			});
			return updatedStore;
		});
	}

	function clickOutside(node) {
		const handleClick = (event) => {
			if (!node.contains(event.target)) {
				node.removeAttribute('open');
			}
		};

		document.addEventListener('click', handleClick, true);

		return {
			destroy() {
				document.removeEventListener('click', handleClick, true);
			}
		};
	}

	function updateUserLoadedFiles(event) {
		core.handleUserLoadedFiles(event);
	}

	function updateExampleDataDropDown(event) {
		core.handleExampleDropdown(event);
	}

	function handleWordSearch(event) {
		const newWord = event.target.value.trim();
		ConfigStore.update((config) => ({
			...config,
			wordToSearch: newWord
		}));
	}

	// Toggle transcript editor visibility
	function toggleEditor() {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				isVisible: !state.config.isVisible
			}
		}));
		// Trigger canvas resize after editor toggle
		// Use requestAnimationFrame to wait for DOM to update
		requestAnimationFrame(() => {
			triggerCanvasResize();
		});
	}

	// Handle split pane resize
	function handlePanelResize(event: CustomEvent<{ sizes: [number, number] }>) {
		EditorStore.update((state) => ({
			...state,
			config: {
				...state.config,
				panelSizes: event.detail.sizes
			}
		}));
		// Trigger canvas resize
		triggerCanvasResize();
	}

	// Safely trigger canvas resize only when container exists and has valid dimensions
	function triggerCanvasResize() {
		if (!p5Instance) return;
		const container = document.getElementById('p5-container');
		if (container) {
			const rect = container.getBoundingClientRect();
			// Only resize if container has valid dimensions
			if (rect.width > 0 && rect.height > 0) {
				p5Instance.windowResized?.();
			}
		}
	}
</script>

<svelte:head>
	<title>TRANSCRIPT EXPLORER</title>
</svelte:head>

<div class="page-container">
<div class="navbar min-h-16 bg-[#ffffff]">
	<div class="flex-1 px-2 lg:flex-none">
		<a class="text-2xl text-black italic" href="/">TRANSCRIPT EXPLORER</a>
	</div>

	<div class="flex justify-end flex-1 px-2">
		<!-- Select Dropdown -->
		<details class="dropdown" use:clickOutside>
			<summary class="btn btn-sm ml-4 tooltip tooltip-bottom flex items-center justify-center"> Visualizations </summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
				{#each techniqueToggleOptions as toggle}
					<li>
						<button on:click={() => toggleSelection(toggle, techniqueToggleOptions)} class="w-full text-left flex items-center">
							<div class="w-4 h-4 mr-2">
								{#if $ConfigStore[toggle]}
									<MdCheck />
								{/if}
							</div>
							{formatToggleName(toggle)}
						</button>
					</li>
				{/each}
			</ul>
		</details>

		<!-- Talk Dropdown -->
		<details class="dropdown" use:clickOutside>
			<summary class="btn btn-sm ml-4 tooltip tooltip-bottom flex items-center justify-center"> Interactions </summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
				{#each visibleInteractions as toggle}
					<li>
						<button on:click={() => toggleSelectionOnly(toggle, allInteractions)} class="w-full text-left flex items-center">
							<div class="w-4 h-4 mr-2">
								{#if $ConfigStore[toggle]}
									<MdCheck />
								{/if}
							</div>
							{formatToggleName(toggle)}
						</button>
					</li>
				{/each}
				{#if showRepeatedWordsSlider}
					<li class="cursor-none">
						<p>Repeated Word Filter: {$ConfigStore.repeatWordSliderValue}</p>
					</li>
					<li>
						<label for="repeatWordRange" class="sr-only">Adjust rect width</label>
						<input
							id="repeatWordRange"
							type="range"
							min="2"
							max="30"
							value={$ConfigStore.repeatWordSliderValue}
							class="range"
							on:input={(e) => handleConfigChangeFromInput(e, 'repeatWordSliderValue')}
						/>
					</li>
				{/if}
				<hr class="my-4 border-t border-gray-300" />
				<input type="text" placeholder="Search conversations..." on:input={(e) => handleWordSearch(e)} class="input input-bordered w-full"/>
			</ul>
		</details>

		<div class="flex items-stretch">
			<IconButton
				id="btn-toggle-editor"
				icon={MdSubject}
				tooltip={'Toggle Editor'}
				on:click={toggleEditor}
			/>

			{#if isVideoShowing}
				<IconButton id="btn-toggle-video" icon={MdVideocam} tooltip={'Show/Hide Video'} on:click={toggleVideo} />
			{:else}
				<IconButton id="btn-toggle-video" icon={MdVideocamOff} tooltip={'Show/Hide Video'} on:click={toggleVideo} />
			{/if}

			<!-- TODO: Need to move this logic into the IconButton component eventually -->
			<div
				data-tip="Upload"
				class="tooltip tooltip-bottom btn capitalize icon max-h-8 max-w-16 bg-[#ffffff] border-[#ffffff] flex items-center justify-center"
				role="button"
				tabindex="0"
				on:click
				on:keydown
			>
				<label for="file-input">
					<MdCloudUpload />
				</label>
			</div>

			<input
				class="hidden"
				id="file-input"
				multiple
				accept=".png, .txt, .jpg, .jpeg, .csv, .mp4"
				type="file"
				bind:files
				on:change={updateUserLoadedFiles}
			/>

			<IconButton icon={MdHelpOutline} tooltip={'Help'} on:click={() => ($isModalOpen = !$isModalOpen)} />

			<IconButton icon={MdSettings} tooltip={'Settings'} on:click={() => (showSettings = true)} />

			<div class="relative inline-block text-left">
				<button
					on:click={() => (showDataDropDown = !showDataDropDown)}
					class="flex justify-between w-full rounded border border-gray-300 p-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring focus:ring-indigo-500"
				>
					{selectedDropDownOption || '-- Select an Example --'}
					<div class={`ml-2 transition-transform duration-300 ${showDataDropDown ? 'rotate-0' : 'rotate-180'}`}>
						<span class="block w-3 h-3 border-l border-t border-gray-700 transform rotate-45"></span>
					</div>
				</button>

				{#if showDataDropDown}
					<div class="absolute z-10 mt-2 w-full rounded-md bg-white shadow-lg max-h-[75vh] overflow-y-auto">
						<ul class="py-1" role="menu" aria-orientation="vertical">
							{#each dropdownOptions as group}
								<li class="px-4 py-2 font-semibold text-gray-600">{group.label}</li>
								{#each group.items as item}
									<li>
										<button
											on:click={() => {
												updateExampleDataDropDown({ target: { value: item.value } });
												showDataDropDown = false;
												selectedDropDownOption = item.label;
											}}
											class="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 w-full text-left"
										>
											{item.label}
										</button>
									</li>
								{/each}
							{/each}
						</ul>
					</div>
				{/if}
			</div>
		</div>
	</div>
</div>

<div class="main-content">
	<SplitPane
		orientation={$EditorStore.config.orientation}
		sizes={$EditorStore.config.panelSizes}
		collapsed={!$EditorStore.config.isVisible}
		collapsedPanel="second"
		on:resize={handlePanelResize}
	>
		<div slot="first" class="h-full relative" id="p5-container">
			<P5 {sketch} />
			<CanvasTooltip />
			<VideoOverlay visible={isVideoShowing} />
		</div>
		<div slot="second" class="h-full">
			<TranscriptEditor />
		</div>
	</SplitPane>
</div>

{#if showSettings}
	<div
		class="modal modal-open"
		on:click|self={() => (showSettings = false)}
		on:keydown={(e) => {
			if (e.key === 'Escape') showSettings = false;
		}}
	>
		<div class="modal-box w-11/12 max-w-md">
			<div class="flex justify-between mb-4">
				<h3 class="font-bold text-lg">Settings</h3>
				<button class="btn btn-circle btn-sm" on:click={() => (showSettings = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="flex flex-col space-y-4">
				<!-- Animation Rate -->
				<div class="flex flex-col">
					<label for="animationRate" class="font-medium">Animation Rate: {currentConfig.animationRate}</label>
					<input
						id="animationRate"
						type="range"
						min="0.01"
						max="1"
						step="0.01"
						bind:value={currentConfig.animationRate}
						on:input={(e) => handleConfigChange('animationRate', parseFloat(e.target.value))}
						class="range range-primary"
					/>
				</div>

				<!-- Text Input for Seconds (Numeric Only) -->
				<div class="flex flex-col">
					<label for="inputSeconds" class="font-medium">End Time (seconds)</label>
					<input
						id="inputSeconds"
						type="text"
						bind:value={timeline.endTime}
						on:input={(e) => {
							let value = parseInt(e.target.value.replace(/\D/g, '')) || 0;
							TimelineStore.update((timeline) => {
								timeline.setCurrTime(0);
								timeline.setStartTime(0);
								timeline.setEndTime(value);
								timeline.setLeftMarker(0);
								timeline.setRightMarker(value);
								return timeline;
							});
						}}
						class="input input-bordered"
					/>
				</div>
			</div>

			<div class="flex flex-col mt-4">
				<button class="btn btn-sm ml-4" on:click={() => (showDataPopup = true)}>Data Explorer</button>
			</div>

			<div class="modal-action">
				<button class="btn btn-warning" on:click={() => p5Instance?.resetScalingVars()}> Reset Settings </button>
				<button class="btn" on:click={() => (showSettings = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}

{#if showDataPopup}
	<div
		class="modal modal-open"
		on:click|self={() => (showDataPopup = false)}
		on:keydown={(e) => {
			if (e.key === 'Escape') showDataPopup = false;
		}}
	>
		<div class="modal-box w-11/12 max-w-5xl">
			<div class="flex justify-between">
				<div class="flex flex-col">
					<h3 class="font-bold text-lg">Data Explorer</h3>
					<p>Here you will find detailed information on the data that you have uploaded.</p>
				</div>

				<button class="btn btn-circle btn-sm" on:click={() => (showDataPopup = false)}>
					<svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</button>
			</div>

			<div class="overflow-x-auto">
				<div class="flex flex-col">
					<div class="flex-col my-4">
						<h4 class="font-bold my-2">Transcript Statistics:</h4>
						<div class="grid grid-cols-2 gap-4 p-4 bg-gray-50 rounded-lg">
							<div>
								<p><span class="font-semibold">Total Words:</span> {$TranscriptStore.totalNumOfWords}</p>
								<p><span class="font-semibold">Total Turns:</span> {$TranscriptStore.totalConversationTurns}</p>
								<p><span class="font-semibold">Total Time:</span> {$TranscriptStore.totalTimeInSeconds.toFixed(2)}s</p>
							</div>
							<div>
								<p><span class="font-semibold">Largest Turn Length:</span> {$TranscriptStore.largestTurnLength} words</p>
								<p>
									<span class="font-semibold">Most Frequent Word:</span> "{$TranscriptStore.mostFrequentWord}" ({$TranscriptStore.maxCountOfMostRepeatedWord}
									times)
								</p>
							</div>
						</div>
					</div>

					<h4 class="font-bold">Users:</h4>
					{#each $UserStore as user}
						<div class="my-4">
							<div tabindex="0" class="text-primary-content bg-[#e6e4df] collapse" aria-controls="collapse-content-{user.name}" role="button">
								<input type="checkbox" class="peer" />
								<div class="collapse-title font-semibold flex items-center">
									<div class="w-4 h-4 rounded-full mr-2" style="background-color: {user.color}"></div>
									{capitalizeEachWord(user.name)}
								</div>

								<div class="collapse-content">
									<div class="grid grid-cols-2 gap-4 p-4">
										<div>
											<p>
												<span class="font-medium">Status:</span>
												<span class={user.enabled ? 'text-green-600' : 'text-red-600'}>
													{user.enabled ? 'Active' : 'Inactive'}
												</span>
											</p>
											<p><span class="font-medium">Color:</span> {user.color}</p>
										</div>
										<div>
											{#if $TranscriptStore.wordArray.length > 0}
												{@const userWords = $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name)}
												{@const userTurns = new Set(userWords.map((dp) => dp.turnNumber))}
												<p><span class="font-medium">Total Words:</span> {userWords.length}</p>
												<p><span class="font-medium">Total Turns:</span> {userTurns.size}</p>
											{/if}
										</div>
									</div>

									{#if $TranscriptStore.wordArray.length > 0}
										<div class="mt-4">
											<h2 class="font-medium mb-2">Recent Speech Samples:</h2>
											<div class="space-y-2">
												{#each $TranscriptStore.wordArray.filter((dp) => dp.speaker === user.name).slice(-3) as dataPoint}
													<div class="p-2 bg-white rounded">
														<p class="text-sm">"{dataPoint.word}"</p>
														<p class="text-xs text-gray-500">Time: {dataPoint.startTime.toFixed(2)}s - {dataPoint.endTime.toFixed(2)}s</p>
													</div>
												{/each}
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			</div>
			<div class="modal-action">
				<button class="btn" on:click={() => (showDataPopup = false)}>Close</button>
			</div>
		</div>
	</div>
{/if}

<div class="btm-nav flex justify-between min-h-20">
	<div class="flex flex-1 flex-row justify-start items-center bg-[#f6f5f3] items-start px-8 overflow-x-auto"
		on:wheel={(e) => {
			if (e.deltaY !== 0) {
				e.preventDefault();
				e.currentTarget.scrollLeft += e.deltaY;
			}
		}}>
		<!-- Users Dropdowns with Floating UI -->
		{#each $UserStore as user, index}
			<div class="relative mr-2">
				<button
					class="btn" style="color: {user.color};"
					on:click={() => {
						const dropdown = document.getElementById(`dropdown-${user.name}`);
						if (dropdown) {
							dropdown.classList.toggle('hidden');

							// Position the dropdown using Floating UI
							const button = document.getElementById(`btn-${user.name}`);
							if (button && !dropdown.classList.contains('hidden')) {
								// Move dropdown to body to avoid clipping by overflow
								document.body.appendChild(dropdown);

								computePosition(button, dropdown, {
									placement: 'top',
									middleware: [
										offset(6),
										flip(),
										shift({ padding: 5 })
									]
								}).then(({x, y}) => {
									Object.assign(dropdown.style, {
										left: `${x}px`,
										top: `${y}px`,
										position: 'absolute',
										zIndex: '9999' // Higher z-index to ensure it's above canvas
									});
								});
							}
						}
					}}
					id={`btn-${user.name}`}
				>
					{user.name}
				</button>

				<div
					id={`dropdown-${user.name}`}
					class="hidden bg-base-100 rounded-box p-2 shadow absolute"
					style="z-index: 9999;"
				>
					<ul class="w-52">
						<li class="py-2">
							<div class="flex items-center">
								<input
									id="userCheckbox-{user.name}"
									type="checkbox"
									class="checkbox mr-2"
									bind:checked={user.enabled}
								/>
								<label for="userCheckbox-{user.name}">Conversation</label>
							</div>
						</li>
						<li class="py-2">
							<div class="flex items-center">
								<input
									type="color"
									class="color-picker max-w-[24px] max-h-[28px] mr-2"
									bind:value={user.color}
								/>
								<span>Color</span>
							</div>
						</li>
					</ul>
				</div>
			</div>
		{/each}
	</div>

	<!-- Right Side: Timeline -->
	<div class="flex-1 bg-[#f6f5f3]">
		<TimelinePanel />
	</div>
</div>
</div>

<slot />

<InfoModal {isModalOpen} />

<style>
	.page-container {
		display: flex;
		flex-direction: column;
		height: 100vh;
		overflow: hidden;
	}

	.color-picker {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
	}

	.main-content {
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}
</style>
