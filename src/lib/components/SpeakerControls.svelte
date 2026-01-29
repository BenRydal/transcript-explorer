<script lang="ts">
	import { get } from 'svelte/store';
	import { onMount } from 'svelte';
	import { computePosition, flip, shift, offset } from '@floating-ui/dom';
	import UserStore from '../../stores/userStore';
	import TranscriptStore from '../../stores/transcriptStore';
	import P5Store from '../../stores/p5Store';
	import UserButtonGroup from './UserButtonGroup.svelte';

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
				if (dropdown && !dropdown.contains(target) && !dropdown.classList.contains('hidden')) {
					// Check if click was on a user button or settings button
					const isUserButtonClick = target.closest('.user-button-container');
					if (!isUserButtonClick) {
						dropdown.classList.add('hidden');
					}
				}
			});
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	});

	// Clean up dropdowns when UserStore changes (e.g., switching datasets)
	let previousUserCount = $state(0);
	$effect(() => {
		const currentUserCount = $UserStore.length;
		if (currentUserCount !== previousUserCount) {
			document.querySelectorAll('body > [id^="dropdown-"]').forEach((dropdown) => {
				dropdown.remove();
			});
			previousUserCount = currentUserCount;
		}
	});

	function handleWheelScroll(e: WheelEvent) {
		if (e.deltaY !== 0) {
			e.preventDefault();
			(e.currentTarget as HTMLElement).scrollLeft += e.deltaY;
			closeAllDropdowns();
		}
	}

	function toggleUserVisibility(index: number) {
		const user = $UserStore[index];
		if (user) {
			user.enabled = !user.enabled;
			UserStore.update((u) => u);
		}
	}

	function openDropdown(index: number, event: MouseEvent) {
		closeAllDropdowns();

		const dropdown = document.getElementById(`dropdown-${index}`);
		if (dropdown) {
			dropdown.classList.remove('hidden');

			// Find the settings button that was clicked (event.currentTarget is null after dispatch)
			const button = (event.target as HTMLElement)?.closest('.settings-button') as HTMLElement;
			if (button) {
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

<div class="flex flex-1 flex-row justify-start items-center bg-[#f6f5f3] px-8 overflow-x-auto" data-tour="speakers" onwheel={handleWheelScroll}>
	<UserButtonGroup users={$UserStore} ontoggleVisibility={(index) => toggleUserVisibility(index)} onopenDropdown={(index, event) => openDropdown(index, event)} />

	{#each $UserStore as user, index}
		<div id={`dropdown-${index}`} class="hidden bg-base-100 rounded-box p-2 shadow absolute" style="z-index: 9999;">
			<ul class="w-52">
				<li class="py-2">
					<div class="flex items-center">
						<input
							type="text"
							class="input input-bordered input-sm w-full"
							value={user.name}
							onchange={(e) => handleNameChange(e, user, index)}
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
