<script setup lang="ts">
import { useData, useRoute } from "vitepress";
import type { DefaultTheme } from "vitepress";
import { computed } from "vue";

const { theme } = useData<DefaultTheme.Config>();
const route = useRoute();

function normalize(link: string): string {
	return link.replace(/(?:\/index)?(?:\.html)?\/?$/, "") || "/";
}

function findItems(
	items: DefaultTheme.SidebarItem[],
	path: string,
): DefaultTheme.SidebarItem[] | undefined {
	for (const item of items) {
		if (item.link && normalize(item.link) === path) return item.items ?? [];
		if (item.items) {
			const nested = findItems(item.items, path);
			if (nested) return nested;
		}
	}
}

const items = computed(() => {
	const sidebar = theme.value.sidebar;
	if (!sidebar) return [];
	const roots = Array.isArray(sidebar)
		? sidebar
		: Object.values(sidebar).flatMap((entry) =>
				Array.isArray(entry) ? entry : entry.items,
			);
	return findItems(roots, normalize(route.path)) ?? [];
});
</script>

<template>
	<ul>
		<li v-for="item in items" :key="item.link ?? item.text">
			<a v-if="item.link" :href="item.link">{{ item.text }}</a>
			<span v-else>{{ item.text }}</span>
		</li>
	</ul>
</template>
