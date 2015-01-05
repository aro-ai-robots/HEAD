#
# face_track.py -  Registery and tracking of faces
# Copyright (C) 2014  Hanson Robotics
#
# This library is free software; you can redistribute it and/or
# modify it under the terms of the GNU Lesser General Public
# License as published by the Free Software Foundation; either
# version 2.1 of the License, or (at your option) any later version.
#
# This library is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# Lesser General Public License for more details.
#
# You should have received a copy of the GNU Lesser General Public
# License along with this library; if not, write to the Free Software
# Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301  USA

from owyl import blackboard
import rospy
from pi_face_tracker.msg import FaceEvent, Faces

# A registery of all the faces currently visible.
# Copies face data to owyl blackboard.
class FaceTrack:

	def __init__(self, owyl_bboard):

		print("Starting Face Tracker")
		self.blackboard = owyl_bboard
		self.visible_faces = []

		# pi_vision topics and events
		self.TOPIC_FACE_EVENT = "face_event"
		self.EVENT_NEW_FACE = "new_face"
		self.EVENT_LOST_FACE = "lost_face"

		self.TOPIC_FACE_LOCATIONS = "face_locations"

		# Face appearance/disappearance from pi_vision
		rospy.Subscriber(self.TOPIC_FACE_EVENT, FaceEvent, self.face_event_cb)

		# Face location information from pi_vision
		rospy.Subscriber(self.TOPIC_FACE_LOCATIONS, Faces, self.face_loc_cb)

	def face_event_cb(self, data):
		self.blackboard["is_interruption"] = True
		if data.face_event == self.EVENT_NEW_FACE:
			str_id = str(data.face_id)
			self.blackboard["new_face"] = str_id
			self.blackboard["background_face_targets"].append(str_id)
			print "New face added to visibile faces: " + \
				str(self.blackboard["background_face_targets"])

		elif data.face_event == self.EVENT_LOST_FACE:
			str_id = str(data.face_id)
			if str_id in self.blackboard["background_face_targets"]:
				self.blackboard["lost_face"] = str_id
				self.blackboard["background_face_targets"].remove(str_id)
				# If the robot lost the new face during the initial
				# interaction, reset new_face variable
				if self.blackboard["new_face"] == str_id :
					self.blackboard["new_face"] = ""

				print "Lost face; visibile faces now: " + \
					str(self.blackboard["background_face_targets"])

	def face_loc_cb(self, data):
		# print("duude ola:" + str(data))
		print("")
