import { DEFAULT_BATCH_SIZE, StreamReadingDirection } from '../../constants';
import { SnapshotNotFoundException } from '../../exceptions';
import { ISnapshot, ISnapshotPool, SnapshotEnvelopeMetadata } from '../../interfaces';
import { AggregateRoot, EventCollection, SnapshotCollection, SnapshotEnvelope, SnapshotStream } from '../../models';
import { SnapshotFilter, SnapshotStore, StreamSnapshotFilter } from '../../snapshot-store';

export interface InMemorySnapshotEntity<A extends AggregateRoot> {
	streamId: string;
	payload: ISnapshot<A>;
	metadata: SnapshotEnvelopeMetadata;
}

export class InMemorySnapshotStore extends SnapshotStore {
	private collections: Map<ISnapshotPool, InMemorySnapshotEntity<any>[]> = new Map();

	setup(pool?: ISnapshotPool): EventCollection {
		const collection = SnapshotCollection.get(pool);
		this.collections.set(collection, []);
		return collection;
	}

	async *getSnapshots<A extends AggregateRoot>(filter?: SnapshotFilter): AsyncGenerator<ISnapshot<A>[]> {
		let entities: InMemorySnapshotEntity<any>[] = [];

		const collection = SnapshotCollection.get(filter?.pool);
		let snapshotStream = filter?.snapshotStream;
		let fromVersion = snapshotStream && ((filter as StreamSnapshotFilter).fromVersion || 0);
		let direction = filter?.direction || StreamReadingDirection.FORWARD;
		let skip = filter?.skip;
		let limit = filter?.limit || Number.MAX_SAFE_INTEGER;
		let batch = filter?.batch || DEFAULT_BATCH_SIZE;

		if (snapshotStream) {
			const { streamId } = snapshotStream;
			entities = this.collections.get(collection).filter(({ streamId: entityStreamId }) => entityStreamId === streamId);
		} else {
			for (const collection of this.collections.values()) {
				entities.push(...collection);
			}
		}

		if (fromVersion) {
			entities = entities.filter(({ metadata }) => metadata.version >= fromVersion);
		}

		if (direction === StreamReadingDirection.BACKWARD) {
			entities = entities.reverse();
		}

		if (skip) {
			entities = entities.slice(skip);
		}

		if (limit) {
			entities = entities.slice(0, limit);
		}

		for (let i = 0; i < entities.length; i += batch) {
			const chunk = entities.slice(i, i + batch);
			yield chunk.map(({ payload }) => payload);
		}
	}

	getSnapshot<A extends AggregateRoot>(
		{ streamId }: SnapshotStream,
		version: number,
		pool?: ISnapshotPool,
	): ISnapshot<A> {
		const collection = SnapshotCollection.get(pool);
		const snapshotCollection = this.collections.get(collection) || [];

		const entity = snapshotCollection.find(
			({ streamId: snapshotStreamId, metadata }) => snapshotStreamId === streamId && metadata.version === version,
		);

		if (!entity) {
			throw new SnapshotNotFoundException(streamId, version);
		}

		return entity.payload;
	}

	appendSnapshot<A extends AggregateRoot>(
		{ streamId, aggregateId }: SnapshotStream,
		aggregateVersion: number,
		snapshot: ISnapshot<A>,
		pool?: ISnapshotPool,
	): void {
		const collection = SnapshotCollection.get(pool);
		const snapshotCollection = this.collections.get(collection) || [];

		const envelope = SnapshotEnvelope.create<A>(snapshot, { aggregateId, version: aggregateVersion });

		snapshotCollection.push({
			streamId,
			payload: envelope.payload,
			metadata: envelope.metadata,
		});
	}

	getLastSnapshot<A extends AggregateRoot>({ streamId }: SnapshotStream, pool?: ISnapshotPool): ISnapshot<A> {
		const collection = SnapshotCollection.get(pool);
		const snapshotCollection = this.collections.get(collection) || [];

		let entity = snapshotCollection.filter(({ streamId: entityStreamId }) => entityStreamId === streamId).sort(
			({ metadata: current }, { metadata: previous }) => (previous.version < current.version ? -1 : 1),
		)[0];

		if (entity) {
			return entity.payload;
		}
	}

	getLastEnvelope<A extends AggregateRoot>({ streamId }: SnapshotStream, pool?: ISnapshotPool): SnapshotEnvelope<A> {
		const collection = SnapshotCollection.get(pool);
		const snapshotCollection = this.collections.get(collection) || [];

		let entity = snapshotCollection.filter(({ streamId: entityStreamId }) => entityStreamId === streamId).sort(
			({ metadata: current }, { metadata: previous }) => (previous.version < current.version ? -1 : 1),
		)[0];

		if (entity) {
			return SnapshotEnvelope.from(entity.payload, entity.metadata);
		}
	}

	async *getEnvelopes<A extends AggregateRoot>(filter?: SnapshotFilter): AsyncGenerator<SnapshotEnvelope<A>[]> {
		let entities: InMemorySnapshotEntity<any>[] = [];

		const collection = SnapshotCollection.get(filter?.pool);
		let snapshotStream = filter?.snapshotStream;
		let fromVersion = snapshotStream && ((filter as StreamSnapshotFilter).fromVersion || 0);
		let direction = filter?.direction || StreamReadingDirection.FORWARD;
		let skip = filter?.skip;
		let limit = filter?.limit || Number.MAX_SAFE_INTEGER;
		let batch = filter?.batch || DEFAULT_BATCH_SIZE;

		if (snapshotStream) {
			const { streamId } = snapshotStream;
			entities = this.collections.get(collection).filter(({ streamId: entityStreamId }) => entityStreamId === streamId);
		} else {
			for (const collection of this.collections.values()) {
				entities.push(...collection);
			}
		}

		if (fromVersion) {
			entities = entities.filter(({ metadata }) => metadata.version >= fromVersion);
		}

		if (direction === StreamReadingDirection.BACKWARD) {
			entities = entities.reverse();
		}

		if (skip) {
			entities = entities.slice(skip);
		}

		if (limit) {
			entities = entities.slice(0, limit);
		}

		for (let i = 0; i < entities.length; i += batch) {
			const chunk = entities.slice(i, i + batch);
			yield chunk.map(({ payload, metadata }) => SnapshotEnvelope.from<A>(payload, metadata));
		}
	}

	getEnvelope<A extends AggregateRoot>(
		{ streamId }: SnapshotStream,
		version: number,
		pool?: ISnapshotPool,
	): SnapshotEnvelope<A> {
		const collection = SnapshotCollection.get(pool);
		const snapshotCollection = this.collections.get(collection) || [];

		let entity = snapshotCollection.find(
			({ streamId: eventStreamId, metadata }) => eventStreamId === streamId && metadata.version === version,
		);

		if (!entity) {
			throw new SnapshotNotFoundException(streamId, version);
		}

		return SnapshotEnvelope.from(entity.payload, entity.metadata);
	}
}
