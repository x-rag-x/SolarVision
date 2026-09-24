CREATE TABLE `detections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inspectionId` varchar(64) NOT NULL,
	`defectType` varchar(128) NOT NULL,
	`confidence` float NOT NULL,
	`x1` float NOT NULL,
	`y1` float NOT NULL,
	`x2` float NOT NULL,
	`y2` float NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `detections_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` int AUTO_INCREMENT NOT NULL,
	`inspectionId` varchar(64) NOT NULL,
	`sourceFilename` varchar(255) NOT NULL,
	`modelName` varchar(128) NOT NULL,
	`status` enum('completed','failed') NOT NULL,
	`processingTimeMs` float NOT NULL,
	`inputImageUrl` text,
	`annotatedImageUrl` text,
	`detectionsCount` int NOT NULL DEFAULT 0,
	`persistenceStatus` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `inspections_id` PRIMARY KEY(`id`),
	CONSTRAINT `inspections_inspectionId_unique` UNIQUE(`inspectionId`)
);
