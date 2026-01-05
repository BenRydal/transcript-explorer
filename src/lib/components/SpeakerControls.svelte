<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { computePosition, flip, shift, offset } from '@floating-ui/dom';
	import UserStore from '../../stores/userStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import P5Store from '../../stores/p5Store';

	function closeAllDropdowns() {
		$UserStore.forEach((_, index) => {
			const dropdown = document.getElementById(`dropdown-${index}`);
			if (dropdown && !dropdown.classList.contains('hidden')) {
				dropdown.classList.add('hidden');
			}
		});
	}

	// Close dropdowns when clicking outside
	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			$UserStore.forEach((_, index) => {
				const dropdown = document.getElementById(`dropdown-${index}`);
				const button = document.getElementById(`btn-${index}`);
				if (dropdown && button && !dropdown.contains(target) && !button.contains(target) && !dropdown.classList.contains('hidden')) {
					dropdown.classList.add('hidden');
				}
			});
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	// Clean up dropdowns when UserStore changes (e.g., switching datasets)
	let previousUserCount = 0;
	$: {
		const currentUserCount = $UserStore.length;
		if (currentUserCount !== previousUserCount) {
			document.querySelectorAll('body > [id^="dropdown-"]').forEach((dropdown) => {
				dropdown.remove();
			});
			previousUserCount = currentUserCount;
		}
	}

	function handleWheelScroll(e: WheelEvent) {
		if (e.deltaY !== 0) {
			e.preventDefault();
			(e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
			closeAllDropdowns();
		}
	}

	function toggleUserVisibility(user: any) {
		user.enabled = !user.enabled;
		UserStore.update((u) => u);
	}

	function openDropdown(index: number) {
		const dropdown = document.getElementById(`dropdown-${index}`);
		if (dropdown) {
			dropdown.classList.toggle('hidden');

			const button = document.getElementById(`btn-${index}`);
			if (button && !dropdown.classList.contains('hidden')) {
				document.body.appendChild(dropdown);

				computePosition(button, dropdown, {
					placement: 'top',
					middleware: [offset(6), flip(), shift({ padding: 5 })]
				}).then(({ x, y }) => {
					Object.assign(dropdown.style, {
						left: `${x}px`,
						top: `${y}px`,
						position: 'absolute',
						zIndex: '9999'
					});
				});
			}
		}
	}

	function handleNameChange(e: Event, user: any, index: number) {
		const oldName = user.name;
		const newName = (e.currentTarget as HTMLInputElement).value.trim();
		if (newName && newName !== oldName) {
			TranscriptStore.update((t) => {
				t.wordArray.forEach((dp) => {
					if (dp.speaker === oldName) {
						dp.speaker = newName;
					}
				});
				return t;
			});
			user.name = newName;
			UserStore.update((u) => u);

			const dropdown = document.getElementById(`dropdown-${index}`);
			if (dropdown) {
				dropdown.classList.add('hidden');
			}

			const p5Instance = get(P5Store);
			p5Instance?.fillAllData?.();
		}
	}
</script>

<div
	class="flex flex-1 flex-row justify-start items-center bg-[#f6f5f3] px-8 overflow-x-auto"
	data-tour="speakers"
	on:wheel={handleWheelScroll}
>
	{#each $UserStore as user, index}
		<div class="relative flex-shrink-0 mr-2">
			<div class="join">
				<!-- Visibility toggle button -->
				<button
					class="btn btn-sm join-item px-1"
					style="color: {user.enabled ? user.color : '#999'}; opacity: {user.enabled ? 1 : 0.5};"
					on:click={() => toggleUserVisibility(user)}
					title={user.enabled ? 'Hide speaker' : 'Show speaker'}
				>
					{#if user.enabled}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
							<path
								fill-rule="evenodd"
								d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
								clip-rule="evenodd"
							/>
						</svg>
					{:else}
						<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
							<path
								fill-rule="evenodd"
								d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
								clip-rule="evenodd"
							/>
							<path
								d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z"
							/>
						</svg>
					{/if}
				</button>
				<!-- Name button opens dropdown -->
				<button
					class="btn btn-sm join-item px-2 max-w-32 truncate"
					style="color: {user.enabled ? user.color : '#999'}; opacity: {user.enabled ? 1 : 0.5};"
					title={user.name}
					on:click={() => openDropdown(index)}
					id={`btn-${index}`}
				>
					{user.name}
				</button>
			</div>

			<div id={`dropdown-${index}`} class="hidden bg-base-100 rounded-box p-2 shadow absolute" style="z-index: 9999;">
				<ul class="w-52">
					<li class="py-2">
						<div class="flex items-center">
							<input
								type="text"
								class="input input-bordered input-sm w-full"
								value={user.name}
								on:change={(e) => handleNameChange(e, user, index)}
								placeholder="Speaker name"
							/>
						</div>
					</li>
					<li class="py-2">
						<div class="flex items-center">
							<input type="color" class="color-picker max-w-[24px] max-h-[28px] mr-2" bind:value={user.color} />
							<span>Color</span>
						</div>
					</li>
				</ul>
			</div>
		</div>
	{/each}
</div>

<style>
	.color-picker {
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		cursor: pointer;
	}
</style>
