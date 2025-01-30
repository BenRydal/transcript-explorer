<script lang="ts">
	import P5, { type Sketch } from 'p5-svelte';

	import type p5 from 'p5';
	import MdHelpOutline from 'svelte-icons/md/MdHelpOutline.svelte';
	import MdCloudUpload from 'svelte-icons/md/MdCloudUpload.svelte';
	import MdVideocam from 'svelte-icons/md/MdVideocam.svelte';
	import MdVideocamOff from 'svelte-icons/md/MdVideocamOff.svelte';
	import MdCheck from 'svelte-icons/md/MdCheck.svelte';
	import MdSettings from 'svelte-icons/md/MdSettings.svelte';

	import type { User } from '../../models/user';

	import UserStore from '../../stores/userStore';
	import P5Store from '../../stores/p5Store';
	import VideoStore from '../../stores/videoStore';

	import { Core } from '$lib';
	import { igsSketch } from '$lib/p5/igsSketch';
	import { writable } from 'svelte/store';
	import IconButton from '$lib/components/IconButton.svelte';
	import IgsInfoModal from '$lib/components/IGSInfoModal.svelte';
	import TimelinePanel from '$lib/components/TimelinePanel.svelte';
	import DataPointTable from '$lib/components/DataPointTable.svelte';

	import TimelineStore from '../../stores/timelineStore';	
	import ConfigStore from '../../stores/configStore';
	import type { ConfigStoreType } from '../../stores/configStore';
	import { initialConfig } from '../../stores/configStore';

	const techniqueToggleOptions = ['diagramToggle', 'chartToggle', 'cloudToggle', 'dashboardToggle'] as const;
	const interactionsToggleOptions = ['flowersToggle', 'separateToggle', 'sortToggle', 'lastWordToggle', 'echoesToggle', 'stopWordsToggle', 'repeatedWordsToggle'] as const;

	let selectedDropDownOption = '';
	const dropdownOptions = [
		{label: 'Classrooms',
			items: [
				{ value: 'example-1', label: 'Kindergarten Activity' },
				{ value: 'example-3', label: 'Classroom Discussion' },
				{ value: 'example-4', label: 'Classroom Science Lesson' }
			]
		},
		{ label: 'Museums', items: [{ value: 'example-2', label: 'Family Gallery Visit' }] },
		{ label: 'Presidential Debates',
			items: [
				{ value: 'example-5', label: 'Biden-Trump 2020 Debate 1' }
			]
		}
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
	let prevConfig = { echoesToggle: currentConfig.echoesToggle, lastWordToggle: currentConfig.lastWordToggle, stopWordsToggle: currentConfig.stopWordsToggle };
	$: {
		const { lastWordToggle, stopWordsToggle, echoesToggle } = currentConfig;
		if (echoesToggle !== prevConfig.echoesToggle ||
			lastWordToggle !== prevConfig.lastWordToggle ||
			stopWordsToggle !== prevConfig.stopWordsToggle
		) {
			p5Instance?.sketchController.fillSelectedData();
			p5Instance?.loop();
		}
		prevConfig = { echoesToggle, lastWordToggle, stopWordsToggle };
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

	function resetSettings() {
		ConfigStore.update(() => ({
			...initialConfig
		}));

		if (p5Instance) {
			p5Instance.loop();
		}
	}

	function capitalizeEachWord(sentence: string) {
		return sentence
			.split(' ')
			.map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
			.join(' ');
	}

	// TODO: Sync this with the capitalizeEachWord function
	function capitalizeFirstLetter(string: string) {
		return string.charAt(0).toUpperCase() + string.slice(1);
	}

	function handleConfigChangeFromInput(e: Event, key: keyof ConfigStoreType) {
		const target = e.target as HTMLInputElement;
		ConfigStore.update((value) => ({
			...value,
			[key]: parseFloat(target.value)
		}));
		p5Instance?.loop(); // Trigger redraw
	}

	function handleConfigChange(key: keyof ConfigStoreType, value: any) {
		ConfigStore.update((store) => ({
			...store,
			[key]: value
		}));
		p5Instance?.loop();
	}

	function toggleSelection(selection: ToggleKey, toggleOptions: ToggleKey[]) {
		ConfigStore.update((store: ConfigStoreType) => {
			const updatedStore = { ...store };
			toggleOptions.forEach((key) => {
				if (key.endsWith('Toggle')) {
					updatedStore[key] = key === selection ? !updatedStore[key] : false;
				}
			});
			p5Instance?.loop();
			return updatedStore;
		});
		p5Instance?.loop();
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
		p5Instance.loop();
	}

	function updateExampleDataDropDown(event) {
		core.handleExampleDropdown(event);
		p5Instance.loop();
	}

	function handleWordSearch(event) {
		const newWord = event.target.value.trim();
		ConfigStore.update((config) => ({
			...config,
			wordToSearch: newWord
		}));
		// Trigger a redraw of the P5 sketch
		if (p5Instance) {
			p5Instance.loop();
		}
	}
</script>

<svelte:head>
	<title>TRANSCRIPT EXPLORER</title>
</svelte:head>

<div class="navbar min-h-16 bg-[#ffffff]">
	<div class="flex-1 px-2 lg:flex-none">
		<a class="text-2xl text-black italic" href="/">TRANSCRIPT EXPLORER</a>
	</div>

	<div class="flex justify-end flex-1 px-2">

		<!-- Select Dropdown -->
		<details class="dropdown" use:clickOutside>
			<summary class="btn btn-sm ml-4 tooltip tooltip-bottom flex items-center justify-center"> Visualization </summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
				{#each techniqueToggleOptions as toggle}
					<li>
						<button on:click={() => toggleSelection(toggle, techniqueToggleOptions)} class="w-full text-left flex items-center">
							<div class="w-4 h-4 mr-2">
								{#if $ConfigStore[toggle]}
									<MdCheck />
								{/if}
							</div>
							{capitalizeFirstLetter(toggle.replace('Toggle', ''))}
						</button>
					</li>
				{/each}
			</ul>
		</details>

		<!-- Talk Dropdown -->
		<details class="dropdown" use:clickOutside>
			<summary class="btn btn-sm ml-4 tooltip tooltip-bottom flex items-center justify-center"> Interactions </summary>
			<ul class="menu dropdown-content rounded-box z-[1] w-52 p-2 shadow bg-base-100">
				{#each interactionsToggleOptions as toggle}
					<li>
						<button on:click={() => toggleSelectionOnly(toggle, interactionsToggleOptions)} class="w-full text-left flex items-center">
							<div class="w-4 h-4 mr-2">
								{#if $ConfigStore[toggle]}
									<MdCheck />
								{/if}
							</div>
							{capitalizeFirstLetter(toggle.replace('Toggle', ''))}
						</button>
					</li>
				{/each}
				<li class="cursor-none">
					<p>Highest repeat count: {$ConfigStore.repeatWordSliderValue}</p>
				</li>
				<li>
					<label for="repeatWordRange" class="sr-only">Adjust rect width</label>
					<input
						id="repeatWordRange"
						type="range"
						min="1"
						max="30"
						value={$ConfigStore.repeatWordSliderValue}
						class="range"
						on:input={(e) => handleConfigChangeFromInput(e, 'repeatWordSliderValue')}
					/>
				</li>
				<input type="text" placeholder="Search conversations..." on:input={(e) => handleWordSearch(e)} class="input input-bordered w-full" />
			</ul>
		</details>

		<div class="flex items-stretch">

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

<div class="h-10">
	<P5 {sketch} />
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

				<!-- Sampling Interval -->
				<div class="flex flex-col">
					<label for="samplingInterval" class="font-medium">Sampling Interval: {currentConfig.samplingInterval} sec</label>
					<input
						id="samplingInterval"
						type="range"
						min="0.1"
						max="5"
						step="0.1"
						bind:value={currentConfig.samplingInterval}
						on:input={(e) => handleConfigChange('samplingInterval', parseFloat(e.target.value))}
						class="range range-primary"
					/>
				</div>

				<!-- Small Data Threshold -->
				<div class="flex flex-col">
					<label for="smallDataThreshold" class="font-medium">Small Data Threshold: {currentConfig.smallDataThreshold}</label>
					<input
						id="smallDataThreshold"
						type="range"
						min="500"
						max="10000"
						step="100"
						bind:value={currentConfig.smallDataThreshold}
						on:input={(e) => handleConfigChange('smallDataThreshold', parseInt(e.target.value))}
						class="range range-primary"
					/>
				</div>

				<!-- Movement StrokeWeight -->
				<div class="flex flex-col">
					<label for="movementStrokeWeight" class="font-medium">Movement Line Weight: {currentConfig.movementStrokeWeight}</label>
					<input
						id="movementStrokeWeight"
						type="range"
						min="1"
						max="20"
						step="1"
						bind:value={currentConfig.movementStrokeWeight}
						on:input={(e) => handleConfigChange('movementStrokeWeight', parseInt(e.target.value))}
						class="range range-primary"
					/>
				</div>

				<!-- Stop StrokeWeight -->
				<div class="flex flex-col">
					<label for="stopStrokeWeight" class="font-medium">Stop Line Weight: {currentConfig.stopStrokeWeight}</label>
					<input
						id="stopStrokeWeight"
						type="range"
						min="1"
						max="20"
						step="1"
						bind:value={currentConfig.stopStrokeWeight}
						on:input={(e) => handleConfigChange('stopStrokeWeight', parseInt(e.target.value))}
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
				<button class="btn btn-warning" on:click={resetSettings}> Reset Settings </button>
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
						<h4 class="font-bold my-2">Codes:</h4>
						<div class="grid grid-cols-5 gap-4">
							<!-- {#each $CodeStore as code}
								<div class="badge badge-neutral">{code.code}</div>
							{/each} -->
						</div>
					</div>

					<h4 class="font-bold">Users:</h4>
					{#each $UserStore as user}
						<div class="my-4">
							<div tabindex="0" class="text-primary-content bg-[#e6e4df] collapse" aria-controls="collapse-content-{user.name}" role="button">
								<input type="checkbox" class="peer" />
								<div class="collapse-title font-semibold">{capitalizeEachWord(user.name)}</div>

								<div class="collapse-content">
									<div class="flex flex-col">
										<div class="flex">
											<h2 class="font-medium">Color:</h2>
											<div class="badge ml-2">{user.color}</div>
										</div>
										<div class="flex">
											<h2 class="font-medium">Enabled</h2>
											{#if user.enabled}
												<div class="badge badge-success ml-2">{user.enabled}</div>
											{:else}
												<div class="badge badge-error ml-2">{user.enabled}</div>
											{/if}
										</div>
									</div>
									<h2 class="font-medium">Data Points:</h2>
									<DataPointTable dataPoints={user.dataTrail} />
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
	<div class="flex flex-1 flex-row justify-start items-center bg-[#f6f5f3] items-start px-8">
		
		<!-- {#if $ConfigStore.dataHasCodes}
			<details class="dropdown dropdown-top" use:clickOutside>
				<summary class="btn">CODES</summary>
				<ul class="menu dropdown-content p-2 bg-base-100 rounded-box w-64 max-h-[75vh] overflow-y-auto flex-nowrap">
					<li>
						<div class="flex items-center">
							<input
								id="enableAllCodes"
								type="checkbox"
								class="checkbox"
								checked={$CodeStore.every((code) => code.enabled)}
								on:change={() => {
									toggleSelectAllCodes();
									p5Instance?.loop();
								}}
							/>
							Enable All
						</div>
						<div class="flex items-center">
							<input
								id="colorByCodes"
								type="checkbox"
								class="checkbox"
								bind:checked={$ConfigStore.isPathColorMode}
								on:change={() => p5Instance?.loop()}
							/>
							Color by Codes
						</div>
						<div class="divider" />
					</li>
					{#each sortedCodes as code, index}
						<li><h3 class="pointer-events-none">{code.code.toUpperCase()}</h3></li>
						<li>
							<div class="flex items-center">
								<input
									id="codeCheckbox-{code.code}"
									type="checkbox"
									class="checkbox"
									bind:checked={code.enabled}
									on:change={() => p5Instance?.loop()}
								/>
								Enabled
							</div>
						</li>
						<li>
							<div class="flex items-center">
								<input type="color" class="color-picker max-w-[24px] max-h-[28px]" bind:value={code.color} on:change={() => p5Instance?.loop()} />
								Color
							</div>
						</li>
						{#if index !== sortedCodes.length - 1}
							<div class="divider" />
						{/if}
					{/each}
				</ul>
			</details>
		{/if} -->

		<!-- Users Dropdowns -->
		{#each $UserStore as user}
			<details class="dropdown dropdown-top" use:clickOutside>
				<summary class="btn">{user.name}</summary>
				<ul class="menu dropdown-content bg-base-100 rounded-box z-[1] w-52 p-2 shadow">
					<li>
						<div class="flex items-center">
							<input
								id="userCheckbox-{user.name}"
								type="checkbox"
								class="checkbox"
								bind:checked={user.enabled}
								on:change={() => p5Instance?.loop()}
							/>
							Conversation
						</div>
					</li>
					<li>
						<div class="flex items-center">
							<input type="color" class="color-picker max-w-[24px] max-h-[28px]" bind:value={user.color} on:click={() => p5Instance?.loop()} />
							Color
						</div>
					</li>
					<!-- Add Transcripts section if needed -->
				</ul>
			</details>
		{/each}
	</div>

	<!-- Right Side: Timeline -->
	<div class="flex-1 bg-[#f6f5f3]">
		<TimelinePanel />
	</div>
</div>

<slot />

<IgsInfoModal {isModalOpen} />

<style>
	.color-picker {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
	}
</style>
