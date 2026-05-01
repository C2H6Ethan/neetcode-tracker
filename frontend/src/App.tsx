import { useEffect, useState } from "react";
import {
  AppShell, Container, Title, Text, Group, Badge, Card, Stack, Checkbox, Button,
  Progress, Tabs, NumberInput, Tooltip, Accordion, Textarea, ActionIcon, Divider,
  Grid, RingProgress, Center, Modal, Box, ScrollArea,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  IconFlame, IconTarget, IconCalendarStats, IconRefresh, IconAlertTriangle,
  IconCheck, IconRocket, IconNotebook, IconTrash,
} from "@tabler/icons-react";
import {
  AppState, Problem, getState, patchProblem, reviewProblem, setGoal, resetAll,
} from "./api";

const diffColor = (d: string) => d === "easy" ? "teal" : d === "medium" ? "yellow" : "red";

function StatCard({ icon, label, value, sub, color }: any) {
  return (
    <Card withBorder padding="md" radius="md">
      <Group gap="xs" mb={4}>
        {icon}
        <Text size="xs" c="dimmed" tt="uppercase" fw={600}>{label}</Text>
      </Group>
      <Text size="xl" fw={700} c={color}>{value}</Text>
      {sub && <Text size="xs" c="dimmed">{sub}</Text>}
    </Card>
  );
}

function ProblemRow({ p, onToggleDone, onToggleShaky, onReview, onNotes, showKind }: {
  p: Problem; onToggleDone: () => void; onToggleShaky: () => void;
  onReview?: () => void; onNotes: (s: string) => void; showKind?: boolean;
}) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState(p.notes);
  useEffect(() => setNotes(p.notes), [p.notes]);

  return (
    <Card withBorder padding="sm" radius="md" style={{ opacity: p.done && !p.shaky ? 0.7 : 1 }}>
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group gap="sm" wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
          <Checkbox
            checked={p.done}
            onChange={onToggleDone}
            size="md"
            color="violet"
          />
          <Box style={{ flex: 1, minWidth: 0 }}>
            <Group gap={6} wrap="wrap">
              <Text fw={500} style={{ textDecoration: p.done && !p.shaky ? "line-through" : "none" }}>
                {p.name}
              </Text>
              <Badge color={diffColor(p.difficulty)} variant="light" size="sm">
                {p.difficulty}
              </Badge>
              {p.shaky && <Badge color="orange" variant="filled" size="sm" leftSection={<IconAlertTriangle size={10}/>}>shaky</Badge>}
              {showKind && p.kind === "review" && <Badge color="orange" variant="dot" size="sm">review</Badge>}
              {showKind && p.kind === "new" && <Badge color="violet" variant="dot" size="sm">new</Badge>}
              {p.completed_date && <Text size="xs" c="dimmed">✓ {p.completed_date}</Text>}
            </Group>
            {p.notes && !editingNotes && (
              <Text size="xs" c="dimmed" mt={4} style={{ fontStyle: "italic" }}>
                {p.notes}
              </Text>
            )}
            {editingNotes && (
              <Group mt="xs" gap="xs">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.currentTarget.value)}
                  placeholder="Pattern / technique notes…"
                  autosize minRows={1} maxRows={4}
                  style={{ flex: 1 }}
                />
                <Button size="xs" onClick={() => { onNotes(notes); setEditingNotes(false); }}>Save</Button>
              </Group>
            )}
          </Box>
        </Group>
        <Group gap="xs" wrap="nowrap">
          <Tooltip label={p.shaky ? "Unmark shaky" : "Mark shaky / needs review"}>
            <ActionIcon
              variant={p.shaky ? "filled" : "subtle"}
              color="orange"
              onClick={onToggleShaky}
            >
              <IconAlertTriangle size={16} />
            </ActionIcon>
          </Tooltip>
          {onReview && p.shaky && (
            <Tooltip label="Mark as reviewed today">
              <ActionIcon variant="subtle" color="green" onClick={onReview}>
                <IconCheck size={16} />
              </ActionIcon>
            </Tooltip>
          )}
          <Tooltip label="Edit notes">
            <ActionIcon variant="subtle" onClick={() => setEditingNotes(v => !v)}>
              <IconNotebook size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
    </Card>
  );
}

export default function App() {
  const [state, setState] = useState<AppState | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);

  const refresh = async () => {
    try {
      const s = await getState();
      setState(s);
    } catch (e) {
      notifications.show({ color: "red", message: "Failed to load state" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  if (loading || !state) return <Center h="100vh"><Text>Loading…</Text></Center>;

  const handleToggle = async (p: Problem) => {
    await patchProblem(p.id, { done: !p.done });
    if (!p.done) notifications.show({ color: "violet", title: "Nice!", message: `${p.name} ✓`, icon: <IconCheck size={16}/> });
    refresh();
  };
  const handleShaky = async (p: Problem) => {
    await patchProblem(p.id, { shaky: !p.shaky });
    refresh();
  };
  const handleReview = async (p: Problem) => {
    await reviewProblem(p.id);
    notifications.show({ color: "green", message: `Reviewed: ${p.name}` });
    refresh();
  };
  const handleNotes = async (p: Problem, notes: string) => {
    await patchProblem(p.id, { notes });
    refresh();
  };
  const handleGoal = async (g: number) => {
    await setGoal(g);
    refresh();
  };
  const handleReset = async () => {
    await resetAll();
    setResetOpen(false);
    notifications.show({ message: "All progress reset" });
    refresh();
  };

  const pct = (state.total_done / 150) * 100;
  const daysLeft = Math.max(0, Math.ceil((new Date(state.target_date).getTime() - Date.now()) / 86400000));

  const problemsByTopic: Record<string, Problem[]> = {};
  for (const t of state.topic_order) problemsByTopic[t] = [];
  for (const p of state.problems) problemsByTopic[p.topic].push(p);

  return (
    <AppShell padding="md" header={{ height: 64 }}>
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <IconRocket size={24} color="var(--mantine-color-violet-5)" />
            <Title order={3}>NeetCode 150 Tracker</Title>
          </Group>
          <Group>
            <Tooltip label="Daily goal (problems/day)">
              <NumberInput
                value={state.daily_goal}
                onChange={(v) => handleGoal(Number(v))}
                min={1} max={20}
                w={90}
                leftSection={<IconTarget size={14}/>}
              />
            </Tooltip>
            <ActionIcon variant="subtle" onClick={refresh}><IconRefresh size={18}/></ActionIcon>
            <Tooltip label="Reset all progress">
              <ActionIcon variant="subtle" color="red" onClick={() => setResetOpen(true)}>
                <IconTrash size={18}/>
              </ActionIcon>
            </Tooltip>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Container size="lg">
          <Grid mb="md">
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                icon={<IconFlame size={16} color="orange"/>}
                label="Streak"
                value={`${state.streak} day${state.streak === 1 ? "" : "s"}`}
                sub={`hitting ${state.daily_goal}/day`}
                color="orange"
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <Card withBorder padding="md" radius="md">
                <Group gap="xs" mb={4}>
                  <IconCheck size={16} color="var(--mantine-color-violet-5)" />
                  <Text size="xs" c="dimmed" tt="uppercase" fw={600}>Progress</Text>
                </Group>
                <Group justify="space-between" align="center">
                  <Box>
                    <Text size="xl" fw={700}>{state.total_done}/150</Text>
                    <Text size="xs" c="dimmed">{state.remaining} to go</Text>
                  </Box>
                  <RingProgress
                    size={56} thickness={6}
                    sections={[{ value: pct, color: "violet" }]}
                    label={<Center><Text size="xs" fw={600}>{Math.round(pct)}%</Text></Center>}
                  />
                </Group>
              </Card>
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                icon={<IconCalendarStats size={16} color="var(--mantine-color-cyan-5)"/>}
                label="Pace (7d avg)"
                value={`${state.pace_7d}/day`}
                sub={`need ${state.required_pace}/day`}
                color={state.pace_7d >= state.required_pace ? "teal" : "orange"}
              />
            </Grid.Col>
            <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
              <StatCard
                icon={<IconTarget size={16} color="var(--mantine-color-pink-5)"/>}
                label="Projected finish"
                value={state.projected_finish ?? "Done!"}
                sub={`target ${state.target_date} · ${daysLeft}d left`}
              />
            </Grid.Col>
          </Grid>

          <Tabs defaultValue="today" variant="pills">
            <Tabs.List mb="md">
              <Tabs.Tab value="today" leftSection={<IconRocket size={14}/>}>Today</Tabs.Tab>
              <Tabs.Tab value="all">All Problems</Tabs.Tab>
              <Tabs.Tab value="review" leftSection={<IconAlertTriangle size={14}/>}>
                Sunday Review {state.sunday_review.length > 0 && <Badge ml={6} color="orange" size="xs">{state.sunday_review.length}</Badge>}
              </Tabs.Tab>
              <Tabs.Tab value="topics">By Topic</Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="today">
              <Stack>
                <Group justify="space-between">
                  <Title order={4}>Today's {state.daily_goal} problems</Title>
                  <Text size="sm" c="dimmed">{state.today}{state.is_sunday && " · Sunday — review day!"}</Text>
                </Group>
                <Progress
                  value={(state.todays_problems.filter(p => p.done).length / state.daily_goal) * 100}
                  color="violet"
                  size="lg"
                />
                {state.todays_problems.length === 0 && (
                  <Card withBorder padding="lg" radius="md">
                    <Center><Text c="dimmed">All 150 done. Go get that internship 🚀</Text></Center>
                  </Card>
                )}
                {state.todays_problems.map(p => (
                  <ProblemRow key={p.id} p={p} showKind
                    onToggleDone={() => handleToggle(p)}
                    onToggleShaky={() => handleShaky(p)}
                    onReview={p.shaky ? () => handleReview(p) : undefined}
                    onNotes={(n) => handleNotes(p, n)}
                  />
                ))}
                <Divider my="md" />
                <Text size="xs" c="dimmed">
                  Today's pick = due spaced-repetition reviews of shaky problems first (1d / 3d / 7d intervals),
                  then the next unsolved problem in NeetCode roadmap order.
                </Text>
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="all">
              <Accordion multiple defaultValue={state.topic_order.slice(0, 1)}>
                {state.topic_order.map(topic => {
                  const ps = problemsByTopic[topic];
                  const done = ps.filter(p => p.done).length;
                  return (
                    <Accordion.Item value={topic} key={topic}>
                      <Accordion.Control>
                        <Group justify="space-between" pr="md">
                          <Text fw={500}>{topic}</Text>
                          <Group gap="xs">
                            <Badge variant="light" color={done === ps.length ? "teal" : "violet"}>
                              {done}/{ps.length}
                            </Badge>
                            <Progress value={(done/ps.length)*100} w={100} color={done===ps.length?"teal":"violet"}/>
                          </Group>
                        </Group>
                      </Accordion.Control>
                      <Accordion.Panel>
                        <Stack gap="xs">
                          {ps.map(p => (
                            <ProblemRow key={p.id} p={p}
                              onToggleDone={() => handleToggle(p)}
                              onToggleShaky={() => handleShaky(p)}
                              onReview={p.shaky ? () => handleReview(p) : undefined}
                              onNotes={(n) => handleNotes(p, n)}
                            />
                          ))}
                        </Stack>
                      </Accordion.Panel>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </Tabs.Panel>

            <Tabs.Panel value="review">
              <Stack>
                <Title order={4}>Shaky problems — flagged for review</Title>
                {state.sunday_review.length === 0 && (
                  <Card withBorder padding="lg"><Center><Text c="dimmed">Nothing flagged. Mark problems shaky as you go.</Text></Center></Card>
                )}
                {state.sunday_review.map(p => (
                  <ProblemRow key={p.id} p={p}
                    onToggleDone={() => handleToggle(p)}
                    onToggleShaky={() => handleShaky(p)}
                    onReview={() => handleReview(p)}
                    onNotes={(n) => handleNotes(p, n)}
                  />
                ))}
              </Stack>
            </Tabs.Panel>

            <Tabs.Panel value="topics">
              <Stack>
                {state.topic_summary.map(t => (
                  <Card key={t.topic} withBorder padding="md">
                    <Group justify="space-between" mb="xs">
                      <Text fw={500}>{t.topic}</Text>
                      <Group gap="xs">
                        <Badge variant="light" color={t.done === t.total ? "teal" : "violet"}>{t.done}/{t.total}</Badge>
                        {t.shaky > 0 && <Badge color="orange" variant="light">{t.shaky} shaky</Badge>}
                      </Group>
                    </Group>
                    <Progress value={(t.done/t.total)*100} color={t.done===t.total?"teal":"violet"} size="md"/>
                  </Card>
                ))}
              </Stack>
            </Tabs.Panel>
          </Tabs>
        </Container>
      </AppShell.Main>

      <Modal opened={resetOpen} onClose={() => setResetOpen(false)} title="Reset all progress?" centered>
        <Text size="sm" mb="md">This wipes completion, shaky flags, notes, and the streak log. Cannot be undone.</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setResetOpen(false)}>Cancel</Button>
          <Button color="red" onClick={handleReset}>Reset everything</Button>
        </Group>
      </Modal>
    </AppShell>
  );
}
